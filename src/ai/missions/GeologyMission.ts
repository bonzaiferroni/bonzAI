import {TransportAnalysis} from "../../interfaces";
import {Operation} from "../operations/Operation";
import {Mission} from "./Mission";
import {LOADAMOUNT_MINERAL} from "../../config/constants";
import {helper} from "../../helpers/helper";
import {Agent} from "../agents/Agent";
import {PathMission} from "./PathMission";
import {empire} from "../Empire";
export class GeologyMission extends Mission {

    private geologists: Agent[];
    private carts: Agent[];
    private repairers: Agent[];
    private mineral: Mineral;
    private store: StoreStructure;
    private analysis: TransportAnalysis;
    private container: StructureContainer;
    private extractorId: string;
    private activated: boolean;

    public memory: {
        distanceToStorage: number;
        distanceToSpawn: number;
        transportAnalysis: TransportAnalysis;
        containerPosition: RoomPosition;
        cartWaitPosition: RoomPosition;
        partsCount: {[partType: string]: number};
        travelTime: number;
        containerId: string;
    };

    constructor(operation: Operation) {
        super(operation, "geology");
    }

    public init() {
        this.mineralStats();
        if (!this.hasVision) { return; }
        this.calculateBestBody();
        this.mineral = this.operation.mineral;
        let extractor = this.mineral.pos.lookForStructure(STRUCTURE_EXTRACTOR);
        if (extractor) {
            this.extractorId = extractor.id;
        } else {
            this.mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
            return;
        }
        this.distanceToSpawn = this.findDistanceToSpawn(this.mineral.pos);
        this.initPathMission();
    }

    public addStore(store: StoreStructure) {
        this.store = store;
    }

    public refresh() {
        if (!this.hasVision) { return; }
        this.mineral = this.operation.mineral;
        if (!this.store) {
            this.store = this.getStorage(this.mineral.pos);
        }
        if (!this.store) { return; }

        this.activated = this.findIfActive();

        this.container = this.findContainer();
        this.analysis = this.cacheTransportAnalysis(this.memory.distanceToStorage, LOADAMOUNT_MINERAL);
    }

    private geoBody = () => {
        if (this.room.controller) {
            return this.workerBody(this.memory.partsCount[WORK], 0, this.memory.partsCount[MOVE]);
        } else {
            return this.workerBody(33, 0, 17);
        }
    };

    private getMaxGeo = () => {
        if (this.activated && this.container) {
            return 1;
        } else {
            return 0;
        }
    };

    private getMaxCarts = () => this.getMaxGeo() > 0 && this.analysis.cartsNeeded ? 1 : 0;
    private getMaxRepairers = () => {
        if (this.mineral.mineralAmount > 5000 && this.container && this.container.hits < 50000) {
            return 1;
        } else {
            return 0;
        }
    };

    public roleCall() {

        this.geologists = this.headCount("geologist", this.geoBody, this.getMaxGeo, this.distanceToSpawn);

        this.carts = this.headCount("geologyCart",
            () => this.workerBody(0, this.analysis.carryCount, this.analysis.moveCount),
            this.getMaxCarts, {prespawn: this.distanceToSpawn});

        this.repairers = this.headCount("repairer", () => this.workerBody(5, 15, 10), this.getMaxRepairers);
    }

    public actions() {
        for (let geologist of this.geologists) {
            this.geologistActions(geologist);
        }

        for (let cart of this.carts) {
            if (this.mineral.mineralAmount > 0) {
                this.cartActions(cart);
            } else {
                this.cleanupCartActions(cart);
            }
        }

        for (let repairer of this.repairers) {
            this.repairActions(repairer);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
        if (Math.random() < .01) {
            this.memory.transportAnalysis = undefined;
            this.memory.distanceToStorage = undefined;
            this.memory.distanceToSpawn = undefined;
        }
    }

    private calculateBestBody() {
        if (this.memory.partsCount) { return; }
        this.memory.partsCount = {};
        let bestMineAmount = 0;
        let bestMovePartsCount = 0;
        let bestWorkPartsCount = 0;
        let bestTravelTime: number;

        for (let i = 1; i < 50; i++) {
            let movePartsCount = i;
            let workPartsCount = MAX_CREEP_SIZE - movePartsCount;
            let ticksPerMove = Math.ceil(1 / (movePartsCount * 2 / workPartsCount));
            let minePerTick = workPartsCount;
            let travelTime = ticksPerMove * this.distanceToSpawn;
            let mineTime = CREEP_LIFE_TIME - travelTime;
            let mineAmount = minePerTick * mineTime;

            if (mineAmount > bestMineAmount) {
                bestMineAmount = mineAmount;
                bestTravelTime = travelTime;
                bestMovePartsCount = movePartsCount;
                bestWorkPartsCount = workPartsCount;
            }
        }

        this.memory.partsCount[WORK] = bestWorkPartsCount;
        this.memory.partsCount[MOVE] = bestMovePartsCount;
        this.memory.travelTime = bestTravelTime;
        return this.workerBody(bestWorkPartsCount, 0, bestMovePartsCount);
    }

    private geologistActions(geologist: Agent) {

        let fleeing = geologist.fleeHostiles();
        if (fleeing) { return; } // early

        if (!this.container) {
            geologist.idleOffRoad(this.mineral);
            return; // early
        }

        if (!geologist.pos.inRangeTo(this.container, 0)) {
            geologist.moveItOrLoseIt(this.container.pos, "geologist");
            return; // early
        }

        if (this.mineral.mineralAmount === 0) {
            if (this.container.store[this.mineral.mineralType] === 0) {
                // break down container
                geologist.dismantle(this.container);
            }
            return; // early
        }

        if (!this.container.store[this.mineral.mineralType] ||
            this.container.store[this.mineral.mineralType] < this.container.storeCapacity - 33) {
            if (Game.time % 6 === 0) { geologist.harvest(this.mineral); }
        }

    }

    private cleanupCartActions(cart: Agent) {

        let fleeing = cart.fleeHostiles();
        if (fleeing) { return; } // early

        if (_.sum(cart.carry) === cart.carryCapacity) {
            if (cart.pos.isNearTo(this.store)) {
                cart.transferEverything(this.store);
            } else {
                cart.travelTo(this.store);
            }
            return; // early;
        }

        if (this.container && _.sum(this.container.store) > 0) {
            if (cart.pos.isNearTo(this.container)) {
                if (this.container.store.energy > 0) {
                    cart.withdraw(this.container, RESOURCE_ENERGY);
                } else if (this.container.store[this.mineral.mineralType] > 0) {
                    cart.withdraw(this.container, this.mineral.mineralType);
                }
            } else {
                cart.travelTo(this.container);
            }
        } else {
            if (_.sum(cart.carry) > 0) {
                if (cart.pos.isNearTo(this.store)) {
                    cart.transferEverything(this.store);
                } else {
                    cart.travelTo(this.store);
                }
                return; // early;
            }

            let spawn = this.spawnGroup.spawns[0];
            if (cart.pos.isNearTo(spawn)) {
                spawn.recycleCreep(cart.creep);
                let witness = this.room.find<Creep>(FIND_MY_CREEPS)[0];
                if (witness) {
                    witness.say("valhalla!");
                }
            } else {
                cart.travelTo(spawn);
            }
            return; // early
        }
    }

    private findContainer() {
        if (!this.activated) { return; }

        if (this.memory.containerId) {
            let container = Game.getObjectById<StructureContainer>(this.memory.containerId);
            if (container) {
                return container;
            } else {
                this.memory.containerId = undefined;
                return this.findContainer();
            }
        } else {
            let container = this.mineral.pos.findInRange<StructureContainer>(
                this.room.findStructures<StructureContainer>(STRUCTURE_CONTAINER), 1)[0];
            if (container) {
                this.memory.containerId = container.id;
                return container;
            }
        }

        if (this.mineral.pos.findInRange(FIND_CONSTRUCTION_SITES, 1).length > 0) { return; }

        let ret = empire.traveler.findTravelPath(this.mineral, this.store);
        if (ret.incomplete) {
            console.log(`MINER: bad path for finding container position ${this.flag.pos.roomName}`);
            return;
        }
        console.log("GEO: building container in", this.operation.name);
        ret.path[0].createConstructionSite(STRUCTURE_CONTAINER);
    }

    private cartActions(cart: Agent) {

        let fleeing = cart.fleeHostiles();
        if (fleeing) { return; } // early

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {
            if (!this.container) {
                if (!cart.pos.isNearTo(this.flag)) {
                    cart.travelTo(this.flag);
                }
                return;
            }

            if (_.sum(this.container.store) < cart.carryCapacity &&
                this.container.pos.lookFor(LOOK_CREEPS).length === 0) {
                cart.idleNear(this.container, 3);
                return;
            }

            if (cart.pos.isNearTo(this.container)) {
                if (this.container.store.energy > 0) {
                    cart.withdraw(this.container, RESOURCE_ENERGY);
                } else {
                    let outcome = cart.withdrawIfFull(this.container, this.mineral.mineralType);
                    if (outcome === OK && this.container.store[this.mineral.mineralType] >= cart.carryCapacity) {
                        cart.travelTo(this.store);
                    }
                }
            } else {
                cart.travelTo(this.container);
            }
            return; // early
        }

        if (cart.pos.isNearTo(this.store)) {
            let outcome = cart.transferEverything(this.store);
            if (outcome === OK && cart.ticksToLive < this.analysis.distance) {
                cart.suicide();
            } else if (outcome === OK) {
                cart.travelTo(this.container);
            }

        } else {
            cart.travelTo(this.store);
        }
    }

    private repairActions(repairer: Agent) {
        let fleeing = repairer.fleeHostiles();
        if (fleeing) { return; }

        if (repairer.room.name !== this.flag.pos.roomName || repairer.pos.isNearExit(0)) {
            repairer.travelTo(this.flag);
            return;
        }

        let hasLoad = repairer.hasLoad();
        if (!hasLoad) {
            repairer.procureEnergy(this.container);
            return;
        }

        if (!this.container || this.container.hits === this.container.hitsMax) {
            repairer.idleOffRoad(this.flag);
            return;
        }

        if (repairer.pos.inRangeTo(this.container, 3)) {
            repairer.repair(this.container);
            repairer.yieldRoad(this.container);
        } else {
            repairer.travelTo(this.container);
        }
    }

    private mineralStats() {
        // TODO: refactor mineralstats to work in global
        // if (!Game.cache[this.operation.mineral.mineralType]) { Game.cache[this.operation.mineral.mineralType] = 0; }
        // Game.cache[this.mineral.mineralType]++;
    }

    private initPathMission() {
        if (!this.store) { return; }

        let pathMission = new PathMission(this.operation, this.name + "Path", {
            start: this.store,
            end: this.mineral,
            rangeToEnd: 2,
        });
        this.operation.addMissionLate(pathMission);
        if (pathMission.distance) {
            this.memory.distanceToStorage = pathMission.distance;
        }
    }

    private findIfActive() {
        return this.mineral.mineralAmount > 0 || this.mineral.ticksToRegeneration < 1000
            || this.mineral.ticksToRegeneration > MINERAL_REGEN_TIME - 1000;
    }
}

type StoreStructure = StructureTerminal | StructureContainer | StructureStorage;
