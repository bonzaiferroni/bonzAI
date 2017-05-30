import {Operation} from "./Operation";
import {Empire} from "../Empire";
import {ScoutMission} from "../missions/ScoutMission";
import {MiningMission} from "../missions/MiningMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {GeologyMission} from "../missions/GeologyMission";
import {LairMission} from "../missions/LairMission";
import {EnhancedBodyguardMission} from "../missions/EnhancedBodyguardMission";
import {InvaderGuru} from "../missions/InvaderGuru";
import {MAX_HARVEST_DISTANCE, MAX_HARVEST_PATH, OperationPriority} from "../../config/constants";
export class KeeperOperation extends Operation {
    private invaderGuru: InvaderGuru;

    /**
     * Remote mining, spawns Scout if there is no vision, spawns a MiningMission for each source in the missionRoom. Can
     * also mine minerals from core rooms
     * @param flag
     * @param name
     * @param type
     */

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.High;
    }

    public init() {

        this.initRemoteSpawn(MAX_HARVEST_DISTANCE, 8, 50);
        if (this.remoteSpawn) {
            this.spawnGroup = this.remoteSpawn.spawnGroup;
        } else {
            console.log("ATTN: no spawnGroup found for", this.name);
            return;
        }

        this.addMission(new ScoutMission(this));
        this.invaderGuru = new InvaderGuru(this);
        this.invaderGuru.init();
        this.addMission(new EnhancedBodyguardMission(this, this.invaderGuru));
        this.addMission(new LairMission(this, this.invaderGuru));

        if (!this.state.hasVision) { return; } // early

        MiningMission.Add(this, false);

        this.addMission(new RemoteBuildMission(this, true));

        if (this.state.mineral.pos.lookFor(LOOK_FLAGS).length === 0) {
            this.addMission(new GeologyMission(this));
        }
    }

    public update() {
        this.invaderGuru.update();
    }

    public finalize() {
    }
    public invalidateCache() {
    }
}
