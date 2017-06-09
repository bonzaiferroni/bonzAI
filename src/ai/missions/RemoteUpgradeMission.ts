import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {Traveler, TravelToReturnData} from "../Traveler";
import {PathMission} from "./PathMission";
import {helper} from "../../helpers/helper";

interface RemoteUpgradeState extends MissionState {
    inboundEnergy: number;
    site: ConstructionSite;
    container: StructureContainer;
    target: Flag;
    energySource: StoreStructure;
}

interface RemoteUpgradeMemory extends MissionMemory {
    distance: number;
    localSource: boolean;
}

export class RemoteUpgradeMission extends Mission {

    private builders: Agent[];
    private carts: Agent[];
    private positions: RoomPosition[];
    private upgraders: Agent[];

    public state: RemoteUpgradeState;
    public memory: RemoteUpgradeMemory;
    public pathMission: PathMission;

    constructor(operation: Operation) {
        super(operation, "remUpgrade");
    }

    protected init() {
        if (!this.state.hasVision) {
            this.operation.removeMission(this);
            return;
        }
    }

    protected update() {
        this.state.target = Game.flags[`${this.operation.name}_target`];
        if (!this.state.target) {
            return;
        }

        // use the storage in spawning room or in local room
        this.state.energySource = this.room.storage;
        let localRoomReady = this.state.target.room.storage && this.state.target.room.storage.store.energy >= 100000;
        if (this.memory.localSource || localRoomReady) {
            if (!this.memory.localSource) {
                this.memory.localSource = true;
                this.memory.distance = undefined;
            }
            this.state.energySource = this.state.target.room.storage;
        }

        // figure out the distance for prespawn purposes
        if (!this.memory.distance) {
            this.memory.distance = Traveler.findTravelPath(this.state.energySource, this.state.target, {
                offRoad: true,
            }).path.length;
        }

        // find container or build one
        this.state.container = this.state.target.pos.lookForStructure<StructureContainer>(STRUCTURE_CONTAINER);
        if (this.state.container) {
            if (!this.positions) {
                this.positions = _(this.state.container.pos.openAdjacentSpots(true))
                    .filter(x => !x.lookForStructure(STRUCTURE_ROAD))
                    .value();
                this.positions = this.positions.concat([ this.state.container.pos]);
            }
            if (this.pathMission) {
                this.pathMission.updatePath(this.state.energySource.pos, this.state.container.pos, 0, .4);
            } else {
                this.pathMission = new PathMission(this.operation, this.name + "Path");
                this.operation.addMissionLate(this.pathMission);
            }
        } else {
            this.state.site = this.state.target.pos.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0];
            if (!this.state.site) {
                this.state.target.pos.createConstructionSite(STRUCTURE_CONTAINER);
            }
        }
    }

    protected getMaxBuilders = () => {
        if (this.state.site) {
            return 1;
        } else {
            return 0;
        }
    };

    protected getBuilderBody = () => {
        return this.bodyRatio(1, 3.5, .5);
    };

    protected getMaxCarts = () => {
        if (this.state.container) {
            let upgCount = this.roleCount("upgrader");
            let analysis = this.cacheTransportAnalysis(this.memory.distance, upgCount * 31);
            return analysis.cartsNeeded;
        } else {
            return 1;
        }
    };

    protected getUpgraderBody = () => {
        return this.workerBody(30, 4, 16);
    };

    protected getMaxUpgraders = () => {
        if (!this.positions) { return 0; }
        return this.positions.length;
    };

    protected roleCall() {
        this.carts = this.headCount("cart", this.standardCartBody, this.getMaxCarts, {
            memory: { scavenger: RESOURCE_ENERGY },
            prespawn: 1,
        });

        this.builders = this.headCount("builder", this.getBuilderBody, this.getMaxBuilders, {
            boosts: [RESOURCE_CATALYZED_LEMERGIUM_ACID],
            allowUnboosted: true,
        });

        this.upgraders = this.headCount("upgrader", this.getUpgraderBody, this.getMaxUpgraders, {
            prespawn: 50,
            boosts: [RESOURCE_CATALYZED_GHODIUM_ACID],
            allowUnboosted: true,
        });
    }

    protected actions() {
        for (let builder of this.builders) {
            this.builderActions(builder);
        }

        if (this.state.container) {
            this.carts = _.sortBy(this.carts, x => x.pos.getRangeTo(this.state.container));
        }
        for (let cart of this.carts) {
            this.cartActions(cart);
        }

        let order = 0;
        for (let upgrader of this.upgraders) {
            this.upgraderActions(upgrader, order++);
        }
    }

    protected finalize() {
    }

    protected invalidateCache() {
        delete this.memory.distance;
    }

    private builderActions(builder: Agent) {
        if (!this.state.site) {
            this.swapRole(builder, "builder", "upgrader");
            return;
        }

        let data: TravelToReturnData = {};
        let options = {
            offRoad: true,
            stuckValue: Number.MAX_VALUE,
            returnData: data,
        };

        if (builder.pos.isNearExit(0)) {
            builder.travelTo(this.state.site, options);
            return;
        }

        let road = builder.pos.lookForStructure(STRUCTURE_ROAD);
        if (!road) {
            let site = builder.pos.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0];
            if (site) {
                builder.build(site);
            } else {
                builder.pos.createConstructionSite(STRUCTURE_ROAD);
            }
            return;
        }

        if (road.hits < road.hitsMax) {
            builder.repair(road);
            return;
        }

        if (builder.pos.isNearTo(this.state.site)) {
            builder.build(this.state.site);
        } else {
            builder.travelTo(this.state.site, options);
            if (data.nextPos) {
                let creep = data.nextPos.lookFor<Creep>(LOOK_CREEPS)[0];
                if (creep) {
                    builder.say("trade ya");
                    creep.move(creep.pos.getDirectionTo(builder));
                }
            }
        }
    }

    private cartActions(cart: Agent) {
        let hasLoad = cart.hasLoad();
        if (!hasLoad) {
            let outcome = cart.retrieve(this.state.energySource, RESOURCE_ENERGY);
            if (outcome === OK) {
                if (this.state.container) {
                    cart.travelTo(this.state.container);
                }
            }
            return;
        }

        if (this.state.container) {

            let range = cart.pos.getRangeTo(this.state.container);
            if (range > 6) {
                cart.travelTo(this.state.container, { roomCallback: (roomName, matrix) => {
                    if (roomName !== this.state.target.pos.roomName) { return; }
                    let link = cart.room.controller.pos.findInRange(
                        cart.room.findStructures<StructureLink>(STRUCTURE_LINK), 3)[0];
                        if (link) {
                            matrix = matrix.clone();
                            helper.blockOffPosition(matrix, link, 2);
                            return matrix;
                        }
                }});
                return;
            }

            if (this.state.inboundEnergy === undefined) {
                this.state.inboundEnergy = this.state.container.store.energy;
            }

            if (cart.carry.energy === cart.carryCapacity && this.state.inboundEnergy > 1200) {
                cart.idleNear(this.state.container, 5);
                return;
            }

            this.state.inboundEnergy += cart.carry.energy;
        }

        let destination: Creep|StoreStructure = this.state.container;
        if (!destination && this.builders.length > 0) {
            destination = this.builders[0].creep;
        }

        if (!destination) {
            cart.idleOffRoad();
            return;
        }

        let outcome = cart.deliver(destination, RESOURCE_ENERGY);
        if (outcome === OK) {
            let dropOff = Agent.normalizeStore(destination);
            let spaceAvailable = dropOff.storeCapacity - dropOff.store.energy;
            if (cart.carry.energy < spaceAvailable) {
                if (cart.ticksToLive < this.memory.distance * 2 + 50) {
                    cart.suicide();
                    return;
                }
                cart.travelTo(this.state.energySource);
            }
        }
    }

    private upgraderActions(upgrader: Agent, order: number) {
        if (!upgrader.memory.hasLoad && upgrader.room === this.room) {
            upgrader.travelTo(this.room.storage);
            let outcome = upgrader.withdraw(this.room.storage, RESOURCE_ENERGY, 100);
            if (outcome === OK) {
                upgrader.memory.hasLoad = true;
            } else {
                return;
            }
        }

        if (!this.positions || !this.state.target) {
            upgrader.idleOffRoad();
            return;
        }

        let position = this.positions[order];
        if (!position || !this.state.container) {
            upgrader.idleNear(this.state.target, 3);
            return;
        }

        if (upgrader.isAt(position)) {
            if (upgrader.carry.energy < 120) {
                upgrader.withdraw(this.state.container, RESOURCE_ENERGY);
            }

            if (this.state.container.hits < this.state.container.hitsMax * .8) {
                upgrader.repair(this.state.container);
            } else {
                upgrader.upgradeController(upgrader.room.controller);
            }
        } else {
            let road = upgrader.pos.lookForStructure<StructureRoad>(STRUCTURE_ROAD);
            if (road && road.hits < road.hitsMax * .6) {
                upgrader.repair(road);
            }

            upgrader.moveItOrLoseIt(position, "upgrader", false, {stuckValue: 4});
        }
    }
}
