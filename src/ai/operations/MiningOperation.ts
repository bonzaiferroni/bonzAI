import {Operation} from "./Operation";
import {ScoutMission} from "../missions/ScoutMission";
import {MiningMission} from "../missions/MiningMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {GeologyMission} from "../missions/GeologyMission";
import {ReserveMission} from "../missions/ReserveMission";
import {BodyguardMission} from "../missions/BodyguardMission";
import {EnhancedBodyguardMission} from "../missions/EnhancedBodyguardMission";
import {OperationPriority, MAX_HARVEST_DISTANCE, MAX_HARVEST_PATH} from "../../config/constants";
import {ROOMTYPE_CORE} from "../WorldMap";
import {InvaderGuru} from "../missions/InvaderGuru";
export class MiningOperation extends Operation {
    private invaderGuru: InvaderGuru;

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

        this.initRemoteSpawn(MAX_HARVEST_DISTANCE, 4, 50);
        if (this.remoteSpawn) {
            this.spawnGroup = this.remoteSpawn.spawnGroup;
        } else {
            return;
        }

        if (this.spawnGroup.room.controller.level < 4) { return; }

        this.addMission(new ScoutMission(this));

        this.invaderGuru = new InvaderGuru(this);
        this.invaderGuru.init();
        // defense
        if (this.flag.room && this.flag.room.roomType === ROOMTYPE_CORE) {
            this.addMission(new EnhancedBodyguardMission(this, this.invaderGuru));
        } else {
            this.addMission(new BodyguardMission(this, this.invaderGuru));
        }

        if (!this.flag.room) { return; }

        ReserveMission.Add(this);
        MiningMission.Add(this, false);

        this.addMission(new RemoteBuildMission(this, true));

        if (!this.flag.room.controller || this.memory.swapMining) {
            this.addMission(new GeologyMission(this));
        }
    }

    public refresh() {
        this.invaderGuru.refresh();
    }

    public finalize() {
    }
    public invalidateCache() {
    }
}
