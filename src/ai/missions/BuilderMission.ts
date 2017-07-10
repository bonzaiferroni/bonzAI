import {Mission, MissionMemory} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
import {TransportAnalysis} from "../../interfaces";
import {PRIORITY_BUILD} from "../../config/constants";
import {DefenseGuru} from "../DefenseGuru";
import {Agent} from "../agents/Agent";

interface BuilderMemory extends MissionMemory {
    max: number;
    transportAnalysis: TransportAnalysis;
    rampartPos: RoomPosition;
    manualTargetId: string;
    manualTargetHits: number;
}

export class BuilderMission extends Mission {

    private builders: Agent[];
    private supplyCarts: Agent[];
    private sites: ConstructionSite[];
    private remoteSpawning: boolean;
    private activateBoost: boolean;
    private defenseGuru: DefenseGuru;
    private boosts: string[];

    public memory: BuilderMemory;
    private _analysis: TransportAnalysis;
    private prespawn: number;

    /**
     * Spawns a creep to update construction and repair walls. Construction will take priority over walls
     * @param operation
     * @param defenseGuru
     * @param activateBoost
     */

    constructor(operation: Operation, defenseGuru: DefenseGuru, activateBoost = false) {
        super(operation, "builder");
        this.defenseGuru = defenseGuru;
        this.activateBoost = activateBoost;
    }

    public init() {
        this.prespawn = 1;
        let underLeveled = this.room && this.room.controller.level <= 6;
        if (underLeveled && this.operation.remoteSpawn) {
            let remoteGroup = this.operation.remoteSpawn.spawnGroup;
            if (remoteGroup && remoteGroup.room.controller.level >= this.room.controller.level) {
                this.remoteSpawning = true;
                this.spawnGroup = remoteGroup;
                this.prespawn = this.operation.remoteSpawn.distance;
            }
        }

        this.boosts = [RESOURCE_CATALYZED_LEMERGIUM_ACID];
    }

    public update() {
        this.sites = this.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
        if (this.sites.length > 0 && this.room.controller.level === 8) {
            let nonRoads = _.filter(this.sites, x => x.structureType !== STRUCTURE_ROAD);
            if (nonRoads.length === 0) {
                this.boosts = undefined;
            }
        }
    }

    private maxBuilders = () => {
        if (this.sites.length === 0) {
            return 0;
        }

        let potency = this.findBuilderPotency();
        let builderCost = potency * 100 + Math.ceil(potency / 2) * 50 + 150 * potency;
        return Math.ceil(builderCost / this.spawnGroup.maxSpawnEnergy);
    };

    private maxCarts = () => {
        if (this.sites.length === 0 || this.defenseGuru.hostiles.length > 0) {
            return 0;
        }
        let builderCount = this.roleCount("builder");
        if (builderCount >= this.maxBuilders()) {
            return this.analysis.cartsNeeded;
        } else {
            return Math.min(this.analysis.cartsNeeded, this.roleCount("builder"));
        }
    };

    private builderBody = () => {

        let potency = this.findBuilderPotency();
        if (this.remoteSpawning) {
            return this.bodyRatio(1, 3, 1, 1, potency);
        } else {
            return this.bodyRatio(1, 3, .5, 1, potency);
        }
    };

    private cartBody = () => this.workerBody(0, this.analysis.carryCount, this.analysis.moveCount);

    public roleCall() {

        // console.log(this.maxBuilders(), this.roomName)
        this.supplyCarts = this.headCount(this.name + "Cart", this.cartBody, this.maxCarts, {
            prespawn: this.prespawn,
            memory: {scavenger: RESOURCE_ENERGY },
        });

        this.builders = this.headCount(this.name, this.builderBody, this.maxBuilders, {
            prespawn: this.prespawn,
            boosts: this.boosts,
            allowUnboosted: true,
        });
    }

    public actions() {
        this.builders = _.sortBy(this.builders, (c: Creep) => c.carry.energy);

        for (let builder of this.builders) {
            this.builderActions(builder);
        }

        for (let cart of this.supplyCarts) {
            this.builderCartActions(cart);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
        this.memory.transportAnalysis = undefined;
    }

    private builderActions(builder: Agent) {

        let hasLoad = builder.hasLoad() || this.supplyCarts.length > 0;
        if (!hasLoad) {
            builder.procureEnergy();
            return;
        }

        // repair the rampart you just built
        if (this.memory.rampartPos) {
            let rampart = helper.deserializeRoomPosition(this.memory.rampartPos).lookForStructure(STRUCTURE_RAMPART);
            if (rampart && rampart.hits < 100000) {
                if (rampart.pos.inRangeTo(builder, 3)) {
                    builder.repair(rampart);
                } else {
                    builder.travelTo(rampart);
                }
                return;
            } else {
                this.memory.rampartPos = undefined;
            }
        }

        // has energy
        let target = builder.pos.findClosestByRange(this.sites);
        // manuall override
        let flag = Game.flags[`${this.operation.name}_build`];
        if (flag) {
            let site = flag.pos.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0];
            if (site) {
                target = site;
            }
        }

        if (!target) {
            // this.buildWalls(builder);
            builder.idleOffRoad(this.flag);
            let rampart = builder.pos.findInRange(
                builder.room.findStructures<StructureRampart>(STRUCTURE_RAMPART), 3)[0];
            if (rampart) {
                let outcome = builder.repair(rampart);
            }
            return;
        }

        // has target
        let range = builder.pos.getRangeTo(target);
        if (range <= 3) {
            let outcome = builder.build(target);
            if (outcome === OK) {
                builder.yieldRoad(target);
            }
            if (outcome === OK && target.structureType === STRUCTURE_RAMPART) {
                this.memory.rampartPos = target.pos;
            }

            // standing on top of target
            if (range === 0) {
                builder.travelTo(this.flag);
            }
        } else {
            builder.travelTo(target);
        }
    }

    private findBuilderPotency() {
        let supplyPotency = 1;
        if (this.room.storage) {
            if (this.room.storage.store.energy < 20000) {
                return 1;
            } else {
                supplyPotency = Math.min(Math.floor(this.room.storage.store.energy / 7500), 10);
            }
        } else {
            supplyPotency = this.room.find(FIND_SOURCES).length * 2;
        }

        return supplyPotency;
    }

    private builderCartActions(cart: Agent) {

        let suppliedAgent = this.findBuilder(cart);
        if (!suppliedAgent) {
            cart.idleOffRoad();
            return;
        }

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {
            cart.procureEnergy(suppliedAgent);
            return;
        }

        let rangeToBuilder = cart.pos.getRangeTo(suppliedAgent);
        if (rangeToBuilder > 3) {
            cart.travelTo(suppliedAgent);
            return;
        }

        let overCapacity = cart.carry.energy > suppliedAgent.carryCapacity - suppliedAgent.carry.energy;
        if (suppliedAgent.carry.energy > suppliedAgent.carryCapacity * .5 && overCapacity) {
            cart.yieldRoad(suppliedAgent);
            return;
        }

        if (rangeToBuilder > 1) {
            cart.travelTo(suppliedAgent);
            return;
        }

        cart.transfer(suppliedAgent, RESOURCE_ENERGY);
        if (!overCapacity && this.room.storage) {
            cart.travelTo(this.room.storage);
        }
    }

    get analysis(): TransportAnalysis {
        if (!this._analysis) {
            let potency = this.findBuilderPotency();
            let distance = 20;
            if (this.room.storage) {
                distance = 10;
            }
            if (this.room.controller.level === 1) {
                distance = 30;
            }
            this._analysis = this.cacheTransportAnalysis(distance, potency * 5);
        }
        return this._analysis;
    }

    private findBuilder(cart: Agent): Creep {
        if (cart.memory.builderId) {
            let builder = Game.getObjectById<Creep>(cart.memory.builderId);
            if (builder && (builder.carry.energy < builder.carryCapacity ||
                (!cart.pos.isNearTo(builder) && Math.random() > .2))) {
                return builder;
            } else {
                delete cart.memory.builderId;
                return this.findBuilder(cart);
            }
        } else {
            let builder = _(this.builders)
                .filter(x => x.carry.energy < x.carryCapacity)
                .min(x => x.carry.energy + x.pos.getRangeTo(cart));
            if (_.isObject(builder)) {
                cart.memory.builderId = builder.id;
                return builder.creep;
            }
        }
    }

}
