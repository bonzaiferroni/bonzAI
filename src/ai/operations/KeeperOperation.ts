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
import {Mission} from "../missions/Mission";
import {PaverMission} from "../missions/PaverMission";
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

        this.updateRemoteSpawn(MAX_HARVEST_DISTANCE, 7, 50);
        let assignedSpawn = this.assignRemoteSpawn();
        if (!assignedSpawn) { return; }

        if (this.spawnGroup.maxSpawnEnergy < 5300) {
            console.log(`KEEPER: unable to spawn in ${this.roomName}, need 5300 to spawn KeeperMission`);
            return;
        }

        this.addMission(new ScoutMission(this));
        if (!this.state.hasVision) { return; } // early

        this.invaderGuru = new InvaderGuru(this);
        this.invaderGuru.init();
        this.addMission(new LairMission(this, this.invaderGuru));

        MiningMission.Add(this, false);

        this.addMission(new RemoteBuildMission(this, true));
        this.addMission(new PaverMission(this));

        if (this.state.mineral.pos.lookFor(LOOK_FLAGS).length === 0) {
            this.addMission(new GeologyMission(this));
        }
    }

    public update() {
        this.updateRemoteSpawn(MAX_HARVEST_DISTANCE, 8, 50);
        if (this.invaderGuru) {
            this.invaderGuru.update();
        }
    }

    protected bypassActions() {
        let bypassMissions = {
            lair: this.missions["lair"],
        };
        // Mission.actions(bypassMissions);
    }

    public finalize() {
    }
    public invalidateCache() {
    }
}
