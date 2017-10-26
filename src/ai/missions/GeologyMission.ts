import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Tick} from "../../Tick";
import {Notifier} from "../../notifier";
import {MemHelper} from "../../helpers/MemHelper";
import {TransportAnalysis} from "../../interfaces";
import {Agent} from "../agents/Agent";
import {PaveData, PaverMission} from "./PaverMission";
import {Traveler} from "../../Traveler";

interface GeologyMemory extends MissionMemory {
    containerIds: string[];
    stations: number[];
    distanceToMineral: number;
    offset: number;
}

interface GeologyState extends MissionState {
    store: StoreStructure;
    containers: StructureContainer[];
    needRepair: boolean;
}

export class GeologyMission extends Mission {

    public memory: GeologyMemory;
    public state: GeologyState;
    protected maxStations = 3;
    protected stations: RoomPosition[];
    private analysis: TransportAnalysis;
    private carts: Agent[];
    private geologists: Agent[];
    private builders: Agent[];

    constructor(operation: Operation) {
        super(operation, "geology");
    }

    protected init() {

        if (!this.state.hasVision || this.spawnGroup.maxSpawnEnergy < 4100) {
            this.operation.sleepMission(this, 100);
            return;
        }
        this.mineralStats();

        if (this.state.mineral.ticksToRegeneration > 2000 && this.roleCount("geoCart") === 0) {
            this.operation.removeMission(this);
            return;
        }

        let storage = this.findStore();
        if (!storage) {
            this.operation.removeMission(this);
            return;
        }

        if (!this.memory.stations) {
            this.memory.stations = this.findStations(storage);
            if (!this.memory.stations) {
                this.operation.removeMission(this);
                return;
            }
        }

        if (!this.memory.distanceToMineral || Math.random() < .1) {
            this.memory.transportAnalysis = undefined;
            this.memory.distanceToMineral = Traveler.findTravelPath(storage, this.state.mineral).path.length;
        }

        if (!this.stations) {
            this.stations = [];
            for (let intPos of this.memory.stations) {
                let position = MemHelper.deserializeIntPosition(intPos, this.roomName);
                this.stations.push(position);
            }
        }

        this.analysis = Mission.analyzeTransport(this.memory.distanceToMineral, 6 * this.stations.length,
            this.spawnGroup.maxSpawnEnergy);

        if (this.memory.offset === undefined) {
            this.memory.offset = Math.floor(Math.random() * 6);
        }

        if (!this.state.mineral.pos.lookFor(LOOK_STRUCTURES)[0]) {
            this.state.mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
        }
    }

    protected update() {
        if (!this.state.hasVision) { return; }
        this.state.store = this.findStore();

        this.findContainers();
        PaverMission.updatePath(this.memory, this.paverCallback);
    }

    protected paverCallback = (): PaveData => {
        return {
            id: this.operation.name + this.name,
            startPos: this.state.store.pos,
            endPos: this.state.mineral.pos,
            rangeToEnd: 2,
            validityInterval: 25000,
        };
    };

    protected maxGeologists = () => {
        if (this.state.mineral.mineralAmount) {
            return this.state.containers.length;
        } else {
            return 0;
        }
    };

    protected maxCarts = () => {
        if (this.state.mineral.mineralAmount) {
            return Math.min(this.roleCount("geo"), this.analysis.cartsNeeded);
        } else {
            return 0;
        }
    };

    protected maxBuilders = () => {
        if (this.state.needRepair) {
            return 1;
        } else {
            return 0;
        }
    };

    protected geoBody = () => {
        return this.workerBody(33, 0, 17);
    };

    protected cartBody = () => {
        return this.workerBody(0, this.analysis.carryCount, this.analysis.moveCount);
    };

    protected builderBody = () => {
        return this.workerBody(10, 10, 10);
    };

    protected roleCall() {
        this.builders = this.headCount("geoBuilder", this.builderBody, this.maxBuilders);

        this.carts = this.headCount("geoCart", this.cartBody, this.maxCarts, {
            prespawn: this.analysis.distance,
        });

        this.geologists = this.headCount("geo", this.geoBody, this.maxGeologists, {
            prespawn: this.analysis.distance,
        });
    }

    protected actions() {
        for (let builder of this.builders) {
            this.builderActions(builder);
        }

        for (let cart of this.carts) {
            this.cartActions(cart);
        }

        for (let geologist of this.geologists) {
            this.geologistActions(geologist);
        }
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }

    private mineralStats() {
        if (Tick.cache.mineralCount[this.state.mineral.mineralType] === undefined) {
            Tick.cache.mineralCount[this.state.mineral.mineralType] = 0;
        }
        Tick.cache.mineralCount[this.state.mineral.mineralType]++;
    }

    private findStations(startingPoint: {pos: RoomPosition}): number[] {
        let ret = Traveler.findTravelPath(startingPoint, this.state.mineral);
        if (ret.incomplete || ret.path.length === 0) {
            Notifier.log(`GEO: unable to find path to mineral in ${this.roomName}`);
            return;
        }

        let containerPos = _.last(ret.path);
        let stations = [containerPos];
        let stationCount = 1;
        for (let position of containerPos.openAdjacentSpots(true)) {
            if (stationCount >= this.maxStations) { break; }
            if (position.getRangeTo(this.state.mineral) === 1) {
                stations.push(position);
                stationCount++;
            }
        }
        let stationInts = [];
        for (let station of stations) {
            let intPos = MemHelper.intPosition(station);
            stationInts.push(intPos);
        }

        return stationInts;
    }

    private findContainers() {
        this.state.containers = [];
        if (!this.memory.containerIds) { this.memory.containerIds = []; }

        let count = 0;
        for (let id of this.memory.containerIds) {
            let container = Game.getObjectById<StructureContainer>(id);
            if (container) {
                count++;
                if (container.hits < container.hitsMax * .5) {
                    let timeToDecay = Math.ceil(container.hits / ((this.room.controller && this.room.controller.my) ? 10 : 50));
                    let timeToFinish =  this.state.mineral.mineralAmount / Math.floor(this.stations.length * 4);
                    if (timeToFinish > timeToDecay) {
                        this.state.needRepair = true;
                    }
                }
                this.state.containers.push(container);
            } else {
                _.pull(this.memory.containerIds, id);
            }
        }

        if (count === this.stations.length) { return; }

        for (let station of this.stations) {
            let container = station.lookForStructure(STRUCTURE_CONTAINER);
            if (container) {
                if (!_.find(this.memory.containerIds, x => x === container.id)) {
                    this.memory.containerIds.push(container.id);
                }
            } else {
                let site = station.lookFor(LOOK_CONSTRUCTION_SITES)[0];
                if (!site) {
                    station.createConstructionSite(STRUCTURE_CONTAINER);
                }
            }
        }
    }

    protected findStore(): StoreStructure {
        return this.spawnGroup.room.storage;
    }

    // Creep Behavior

    private builderActions(builder: Agent) {
        let hasLoad = builder.hasLoad();
        if (!hasLoad) {
            builder.procureEnergy();
            return;
        }

        let target = _.find(this.state.containers, x => x.hits < x.hitsMax);
        if (!target) {
            builder.idleOffRoad();
            return;
        }

        builder.travelTo(target, {range: 3});
        builder.repair(target);
    }

    protected geologistActions(geologist: Agent) {

        let container = this.findGeoContainer(geologist);
        if (!container) {
            geologist.idleNear(this.state.mineral, 3);
            return;
        }

        if (!geologist.pos.inRangeTo(container, 0)) {
            geologist.moveItOrLoseIt(container.pos, "geologist");
            return; // early
        }

        if (Game.time % 6 === this.memory.offset && _.sum(container.store) <= container.storeCapacity - 33) {
            geologist.harvest(this.state.mineral);
        }
    }

    private cartActions(cart: Agent) {

        let fleeing = cart.fleeHostiles();
        if (fleeing) { return; } // early

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {

            let container = this.findCartContainer(cart);
            if (!container) {
                cart.idleNear(this.state.mineral, 3);
                return;
            }

            if (cart.pos.isNearTo(container)) {
                let outcome = cart.withdrawEverything(container);
                if (outcome === OK) {
                    delete cart.memory.containerId;
                }
            } else {
                cart.travelTo(container);
            }
            return; // early
        }

        if (cart.pos.isNearTo(this.state.store)) {
            let outcome = cart.transferEverything(this.state.store);
            if (outcome === OK && _.sum(cart.carry) === 0) {
                if (this.analysis && cart.ticksToLive < this.analysis.distance) {
                    cart.suicide();
                } else {
                    cart.travelTo(this.state.mineral);
                }
            }
        } else {
            cart.travelTo(this.state.store);
        }
    }

    private findGeoContainer(geologist: Agent): StructureContainer {
        if (geologist.memory.containerId) {
            let container = Game.getObjectById<StructureContainer>(geologist.memory.containerId);
            if (container) {
                return container;
            } else {
                delete geologist.memory.containerId;
                return this.findGeoContainer(geologist);
            }
        } else {
            let container = _.find(this.state.containers, x => this.notClaimed(x, "containerId", this.geologists));
            if (container) {
                geologist.memory.containerId = container.id ;
                return container;
            }
        }
    }

    private findCartContainer(cart: Agent): StructureContainer {
        if (cart.memory.containerId) {
            let container = Game.getObjectById<StructureContainer>(cart.memory.containerId);
            if (container && _.sum(container.store) > 0) {
                return container;
            } else {
                delete cart.memory.containerId;
                return this.findCartContainer(cart);
            }
        } else {

            if (!cart.pos.inRangeTo(this.state.mineral, 4)) { return; }

            let container = _.find(this.state.containers,
                x => {
                    let amount = _.sum(x.store);
                    if (amount > 0 && !this.state.mineral.mineralAmount) {
                        return true;
                    } else {
                        return amount > 500 || amount >= cart.carryCapacity - _.sum(cart.carry);
                    }
                });
            if (container) {
                cart.memory.containerId = container.id;
                return container;
            }
        }
    }
}
