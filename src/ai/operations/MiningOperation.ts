import {Operation, OperationMemory} from "./Operation";
import {ScoutMission} from "../missions/ScoutMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {ReserveMission} from "../missions/ReserveMission";
import {EnhancedBodyguardMission} from "../missions/EnhancedBodyguardMission";
import {OperationPriority, MAX_HARVEST_DISTANCE, MAX_HARVEST_PATH, USERNAME} from "../../config/constants";
import {ROOMTYPE_CORE, WorldMap} from "../WorldMap";
import {InvaderGuru} from "../missions/InvaderGuru";
import {Mission} from "../missions/Mission";
import {PaverMission} from "../missions/PaverMission";
import {GeologyMission} from "../missions/GeologyMission";
import {empire} from "../Empire";
import {ClaimMission} from "../missions/ClaimMission";
import {MiningBodyguardMission} from "../missions/MiningBodyguardMission";

interface MiningOperationMemory extends OperationMemory {
    lastReserved: number;
}

export class MiningOperation extends Operation {
    private invaderGuru: InvaderGuru;
    public memory: MiningOperationMemory;

    /**
     * Remote mining, spawns Scout if there is no vision, spawns a MiningMission for each source in the missionRoom. Can
     * also mine minerals from core rooms
     * @param flag
     * @param name
     * @param type
     * @param empire
     */

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.Low;
    }

    public init() {

        this.updateRemoteSpawn(MAX_HARVEST_DISTANCE, 300, 50);
        let foundSpawn = this.assignRemoteSpawn();
        if (!foundSpawn) { return; }

        if (this.spawnGroup.room.controller.level < 2) { return; }

        this.addMission(new ScoutMission(this));

        this.invaderGuru = new InvaderGuru(this);
        this.invaderGuru.init();
        // defense
        if (this.flag.room && WorldMap.roomType(this.flag.pos.roomName) === ROOMTYPE_CORE) {
            this.addMission(new EnhancedBodyguardMission(this, this.invaderGuru));
            this.addMission(new GeologyMission(this));
        } else {
            this.addMission(new MiningBodyguardMission(this, this.invaderGuru));
        }

        if (!this.flag.room) { return; }

        if (this.spawnGroup.maxSpawnEnergy >= 550) {
            ReserveMission.Add(this);
        }

        Operation.addMining(this, false, false);

        this.addMission(new PaverMission(this));
    }

    public update() {
        this.updateRemoteSpawn(MAX_HARVEST_DISTANCE, 300, 50);
        if (this.invaderGuru) {
            this.invaderGuru.update();
        }
    }

    protected bypassActions() {
        let bypassMissions = {};
        if (this.missions["bodyguard"]) { bypassMissions["bodyguard"] = this.missions["bodyguard"]; }
        if (this.missions["defense"]) { bypassMissions["defense"] = this.missions["defense"]; }
        Mission.actions(bypassMissions);
    }

    public finalize() {
        if (this.room && this.room.controller) {
            if (this.room.controller.reservation && this.room.controller.reservation.username === USERNAME) {
                this.memory.lastReserved = Game.time;
            }
            if (Game.time > this.memory.lastReserved + 5000) {
                this.flag.remove();
            }
        }
    }
    public invalidateCache() {
    }
}
