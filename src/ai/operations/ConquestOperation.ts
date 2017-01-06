import {Operation} from "./Operation";
import {Empire} from "../Empire";
import {RefillMission} from "../missions/RefillMission";
import {DefenseMission} from "../missions/DefenseMission";
import {MiningMission} from "../missions/MiningMission";
import {LinkNetworkMission} from "../missions/LinkNetworkMission";
import {UpgradeMission} from "../missions/UpgradeMission";
import {OperationPriority} from "../../config/constants";
import {ScoutMission} from "../missions/ScoutMission";
import {BodyguardMission} from "../missions/BodyguardMission";
import {TransportMission} from "../missions/TransportMission";
import {ClaimMission} from "../missions/ClaimMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";


const CONQUEST_MASON_POTENCY = 4;
const CONQUEST_LOCAL_MIN_SPAWN_ENERGY = 1300;

export class ConquestOperation extends Operation {

    /**
     * Facilitates the establishment of new owned-rooms by spawning necessary creeps from a nearby room. Will spawn a
     * claimer as needed. Spawning responsibilities can be changed-over to the local room by simply removing this operation
     * flag and replacing it with a FortOperation flag of the same name
     * @param flag
     * @param name
     * @param type
     * @param empire
     */

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super (flag, name, type, empire);
        this._priority = OperationPriority.Medium;
    }

    initOperation() {
        this.findOperationWaypoints();
        if (!this.memory.spawnRoom) {
            if (Game.time % 3 === 0) {
                console.log(this.name, "needs a spawn room, example:", this.name + ".setSpawnRoom(otherOpName.flag.room.name)");
            }
            return; // early
        }

        this._spawnGroup = this.empire.getSpawnGroup(this.memory.spawnRoom);
        if (!this.spawnGroup) {
            console.log("Invalid spawn room specified for", this.name);
            return;
        }

        this.addMission(new ScoutMission(this));

        if (!this.hasVision || !this.flag.room.controller.my) {
            this.addMission(new ClaimMission(this));
        }

        if (!this.hasVision) return; // early

        if (this.flag.room.findStructures(STRUCTURE_TOWER).length === 0) {
            this.addMission(new BodyguardMission(this));
        }



        // build construction
        this.addMission(new RemoteBuildMission(this, false));

        // upgrader controller
        this.addMission(new UpgradeMission(this, true));

        // bring in energy from spawnroom (requires a flag with name "opName_destination" be placed on controller battery)
        let destinationFlag = Game.flags[`${this.name}_destination`];
        if (destinationFlag && this.memory.maxTransportCarts) {
            let storage = this.spawnGroup.room.storage;
            let storeStructure = destinationFlag.pos.lookFor(LOOK_STRUCTURES)[0] as StructureContainer | StructureStorage | StructureTerminal;
            if (storage && storeStructure) {
                let maxCarts = 5 * Game.map.getRoomLinearDistance(storage.pos.roomName, storeStructure.pos.roomName);
                if (this.memory.maxTransportCarts) {
                    maxCarts = this.memory.maxTransportCarts;
                }
                let offRoadTransport = false;
                if (this.memory.offRoadTransport) {
                    offRoadTransport = this.memory.offRoadTransport;
                }
                this.addMission(new TransportMission(this, maxCarts, storage, storeStructure, RESOURCE_ENERGY, offRoadTransport));
            }
        }

        // the following can be spawned locally
        let localSpawnGroup = this.empire.getSpawnGroup(this.flag.room.name);
        if (localSpawnGroup && localSpawnGroup.maxSpawnEnergy >= CONQUEST_LOCAL_MIN_SPAWN_ENERGY) {
            this._waypoints = undefined;
            this._spawnGroup = localSpawnGroup;
            this.addMission(new RefillMission(this));
        }

        for (let i = 0; i < this.sources.length; i++) {
            if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0) continue;
            this.addMission(new MiningMission(this, "miner" + i, this.sources[i]));
        }

        // use link array near storage to fire energy at controller link (pre-rcl8)
        this.addMission(new LinkNetworkMission(this));

        // shoot towers and refill
        this.addMission(new DefenseMission(this));
    }

    finalizeOperation() {
    }

    invalidateOperationCache() {
    }

}