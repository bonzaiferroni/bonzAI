import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Tick} from "../../Tick";
import {Traveler} from "../Traveler";
import {Notifier} from "../../notifier";
import {MemHelper} from "../../helpers/MemHelper";
import {TransportAnalysis} from "../../interfaces";
import {Agent} from "../agents/Agent";

interface GeologyMemory extends MissionMemory {
    stations: string;
    distanceToMineral: number;
}

interface GeologyState extends MissionState {
    containers: StructureContainer[];
    sites: ConstructionSite[];
    needBuilder: boolean;
}

export class GeologyMission2 extends Mission {

    public memory: GeologyMemory;
    public state: GeologyState;
    protected maxStations = 3;
    protected stations: RoomPosition[];
    private analysis: TransportAnalysis;
    private offset: number;
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

        if (this.state.mineral.ticksToRegeneration > 3000 && this.roleCount("cart") === 0) {
            this.operation.removeMission(this);
            return;
        }

        let storage = this.getStorage(this.state.mineral.pos);
        if (!storage) {
            this.operation.removeMission(this);
            return;
        }

        if (!this.memory.stations) {
            this.memory.stations = this.findStations(storage);
        }

        if (!this.memory.distanceToMineral || Math.random() < .1) {
            this.memory.transportAnalysis = undefined;
            this.memory.distanceToMineral = Traveler.findTravelPath(storage, this.state.mineral).path.length;
        }

        if (!this.stations) {
            this.stations = MemHelper.deserializeIntPositions(this.memory.stations, this.roomName);
        }

        this.analysis = Mission.analyzeTransport(this.memory.distanceToMineral, 6 * this.stations.length,
            this.spawnGroup.maxSpawnEnergy);

        this.offset = Math.floor(Math.random() * 6);
    }

    protected maxGeologists = () => {
        if (this.state.mineral.mineralAmount) {
            return this.stations.length;
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
        if (this.state.needBuilder) {
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

    protected update() {
        if (!this.state.hasVision) { return; }

        let cpu = Game.cpu.getUsed();
        this.findContainers();
        cpu = Game.cpu.getUsed() - cpu;
        console.log("findContainers", cpu);
    }

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
            //this.cartActions(cart);
        }

        for (let geologist of this.geologists) {
            //this.geologistActions(geologist);
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

    private findStations(startingPoint: {pos: RoomPosition}): string {
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

        return MemHelper.intPositions(stations);
    }

    private findContainers() {
        this.state.containers = [];
        this.state.sites = [];
        this.state.needBuilder = false;
        for (let station of this.stations) {
            let container = station.lookForStructure<StructureContainer>(STRUCTURE_CONTAINER);
            if (container) {
                let timeToDecay = Math.ceil(container.hits / ((this.room.controller && this.room.controller.my) ? 10 : 50));
                let timeToFinish =  this.state.mineral.mineralAmount / Math.floor(this.stations.length * 4);
                if (container.hits < container.hitsMax * .5 && timeToFinish > timeToDecay) {
                    this.state.needBuilder = true;
                }
                this.state.containers.push(container);
            } else {
                let site = station.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0];
                if (site) {
                    this.state.needBuilder = true;
                    this.state.sites.push(site);
                } else if (this.state.mineral.mineralAmount > 0 || this.state.mineral.ticksToRegeneration < 3000) {
                    station.createConstructionSite(STRUCTURE_CONTAINER);
                }
            }
        }
    }

    // Creep Behavior

    private builderActions(builder: Agent) {
        let hasLoad = builder.hasLoad();
        if (!hasLoad) {
            builder.procureEnergy();
            return;
        }

        let target: ConstructionSite|StructureContainer = builder.pos.findClosestByRange(this.state.sites);
        if (!target) {
            // let disrepairedContainers = _
            // target = builder.pos.findClosestByRange()
        }
    }
}
