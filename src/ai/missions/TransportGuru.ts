import {Guru} from "./Guru";
import {TransportAnalysis} from "../../interfaces";
export class TransportGuru extends Guru {

    distance: number;
    load: number;

    private _analysis: TransportAnalysis;

    getStorage(pos: RoomPosition): StructureStorage {
        if (this.memory.tempStorageId) {
            let storage = Game.getObjectById<StructureStorage>(this.memory.tempStorageId);
            if (storage) {
                return storage;
            }
            else {
                console.log("ATTN: Clearing temporary storage id for", this.host.name, "in", this.flag.pos.roomName);
                this.memory.tempStorageId = undefined;
            }
        }

        if (this.memory.storageId) {
            let storage = Game.getObjectById<StructureStorage>(this.memory.storageId);
            if (storage && storage.room.controller.level >= 4) {
                return storage;
            }
            else {
                console.log("ATTN: attempting to find better storage for",
                    this.host.name, "in", this.flag.pos.roomName);
                this.memory.storageId = undefined;
                return this.getStorage(pos);
            }
        }
        else {
            let storages = _.filter(this.empire.storages, (s: Structure) => s.room.controller.level >= 4);
            let storage = pos.findClosestByLongPath(storages) as Storage;
            if (!storage) {
                storage = pos.findClosestByRoomRange(storages) as Storage;
                console.log("couldn't find storage via path, fell back to find closest by missionRoom range for",
                    this.host.name, "in", this.flag.pos.roomName);
            }
            if (storage) {
                console.log("ATTN: attempting to find better storage for", this.host.name, "in", this.flag.pos.roomName);
                this.memory.storageId = storage.id;
                return storage;
            }
        }
    }

    /**
     * Used to determine cart count/size based on transport distance and the bandwidth needed
     * @param distance - distance (or average distance) from point A to point B
     * @param load - how many resource units need to be transported per tick (example: 10 for an energy source)
     * @returns {{body: string[], cartsNeeded: number}}
     */

    get analysis(): TransportAnalysis {
        if (!this._analysis) {
            this._analysis = this.cacheTransportAnalysis(this.distance, this.load);
        }
        return this._analysis;
    }

    protected cacheTransportAnalysis(distance: number, load: number): TransportAnalysis {
        if (!this.memory.transportAnalysis || load !== this.memory.transportAnalysis.load
            || distance !== this.memory.transportAnalysis.distance) {
            this.memory.transportAnalysis = TransportGuru.analyzeTransport(distance, load,
                this.host.spawnGroup.maxSpawnEnergy);
        }
        return this.memory.transportAnalysis;
    }

    static analyzeTransport(distance: number, load: number, maxSpawnEnergy: number): TransportAnalysis {
        // cargo units are just 2 CARRY, 1 MOVE, which has a capacity of 100 and costs 150
        let maxUnitsPossible = Math.min(Math.floor(maxSpawnEnergy /
            ((BODYPART_COST[CARRY] * 2) + BODYPART_COST[MOVE])), 16);
        let bandwidthNeeded = distance * load * 2.1;
        let cargoUnitsNeeded = Math.ceil(bandwidthNeeded / (CARRY_CAPACITY * 2));
        let cartsNeeded = Math.ceil(cargoUnitsNeeded / maxUnitsPossible);
        let cargoUnitsPerCart = Math.floor(cargoUnitsNeeded / cartsNeeded);
        return {
            load: load,
            distance: distance,
            cartsNeeded: cartsNeeded,
            carryCount: cargoUnitsPerCart * 2,
            moveCount: cargoUnitsPerCart,
        };
    }

    static loadFromSource(source: Source): number {
        return Math.max(source.energyCapacity, SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME;
    }
}