import {MiningMission} from "./MiningMission";
import {TransportGuru} from "./TransportGuru";
import {notifier} from "../../notifier";
import {helper} from "../../helpers/helper";
export class SourceGuru extends TransportGuru {

    opName: string;
    opType: string;
    source: Source;
    remoteSpawning: boolean;

    memory: {
        positionCount: number;
        distanceToStorage: number;
    };

    private _maxMiners: number;

    constructor(host: MiningMission) {
        super(host);
        this.opName = host.opName;
        this.opType = host.opType;
        this.source = host.source;
        this.remoteSpawning = host.remoteSpawning;
    }

    init() {
        if (!this.memory.distanceToStorage) {
            let storage = this.findMinerStorage();
            if (!storage) return;
            let path = PathFinder.search(storage.pos, {pos: this.source.pos, range: 1}).path;
            this.memory.distanceToStorage = path.length;
        }
        this.distance = this.memory.distanceToStorage;
        this.load = TransportGuru.loadFromSource(this.source);
    }

    findMinerStorage(): StructureStorage {
        let destination = Game.flags[this.opName + "_sourceDestination"];
        if (destination) {
            let structure = destination.pos.lookFor(LOOK_STRUCTURES)[0] as StructureStorage;
            if (structure) {
                return structure;
            }
        }

        if (this.opType === "mining" || this.opType === "keeper") {
            return this.getStorage(this.source.pos);
        }
        else {
            if (this.room.storage && this.room.storage.my) {
                return this.flag.room.storage;
            }
        }
    }

    findContainer(): StructureContainer {
        let container = this.source.findMemoStructure<StructureContainer>(STRUCTURE_CONTAINER, 1);
        if (!container) {
            this.placeContainer();
        }
        return container;
    }

    private placeContainer() {

        let startingPosition: {pos: RoomPosition} = this.findMinerStorage();
        if (!startingPosition) {
            startingPosition = this.room.find(FIND_MY_SPAWNS)[0] as StructureSpawn;
        }
        if (!startingPosition) {
            startingPosition = this.room.find<ConstructionSite>(FIND_CONSTRUCTION_SITES,
                {filter: ( (s: ConstructionSite) => s.structureType === STRUCTURE_SPAWN)})[0];
        }
        if (!startingPosition) return;

        if (this.source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1).length > 0) return;

        let ret = PathFinder.search(this.source.pos, [{pos: startingPosition.pos, range: 1}], {
            maxOps: 4000,
            swampCost: 2,
            plainCost: 2,
            roomCallback: (roomName: string): CostMatrix => {
                let room = Game.rooms[roomName];
                if (!room) return;

                let matrix = new PathFinder.CostMatrix();
                helper.addStructuresToMatrix(matrix, room);

                return matrix;
            }
        });
        if (ret.incomplete || ret.path.length === 0) {
            notifier.add(`path used for container placement in ${this.opName} incomplete, please investigate`);
        }

        let position = ret.path[0];
        let testPositions = _.sortBy(this.source.pos.openAdjacentSpots(true), (p: RoomPosition) => p.getRangeTo(position));
        for (let testPosition of testPositions) {
            let sourcesInRange = testPosition.findInRange(FIND_SOURCES, 1);
            if (sourcesInRange.length > 1) { continue; }
            console.log(`MINER: placed container in ${this.opName}`);
            testPosition.createConstructionSite(STRUCTURE_CONTAINER);
            return;
        }

        console.log(`MINER: Unable to place container in ${this.opName}`);
    }

    get maxMiners() {
        if (!this._maxMiners) {
            if (!this.memory.positionCount) {
                this.memory.positionCount = this.source.pos.openAdjacentSpots(true).length;
            }

            let max = 1;
            if (this.host.spawnGroup.maxSpawnEnergy < 1050 && !this.remoteSpawning) {
                max = 2;
                if (this.host.spawnGroup.maxSpawnEnergy < 450) {
                    max = 3;
                }
            }

            this._maxMiners = Math.min(max, this.memory.positionCount);
        }

        return this._maxMiners;
    }
}