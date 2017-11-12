import {Operation} from "./Operation";
import {OperationPriority} from "../../config/constants";
import {Layout, LAYOUT_SWAP} from "../layouts/Layout";
import {LayoutFactory} from "../layouts/LayoutFactory";
import {LayoutBuilder} from "../layouts/LayoutBuilder";
import {ScoutMission} from "../missions/ScoutMission";
import {LayoutDisplay} from "../layouts/LayoutDisplay";
import {ClaimMission} from "../missions/ClaimMission";
import {UpgradeMission} from "../missions/UpgradeMission";
import {RefillMission} from "../missions/RefillMission";
import {core} from "../Empire";
import {SwapUpgradeMission} from "../missions/SwapUpgradeMission";
import {SwapMission} from "../missions/SwapMission";
import {SwapGeologyMission} from "../missions/SwapGeologyMission";
export class SwapOperation extends Operation {
    public layout: Layout;
    private builder: LayoutBuilder;

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.VeryHigh;
    }

    public init() {
        this.autoLayout();
        this.updateRemoteSpawn(1, 12900);
        let spawnGroupAssigned = this.assignRemoteSpawn();
        if (!spawnGroupAssigned) { return; }

        if (!this.room.controller.my) {
            this.addMission(new ClaimMission(this));
        }

        if (!this.state.hasVision) { return; }

        this.addMission(new SwapUpgradeMission(this));
        this.addMission(new SwapMission(this));
        this.addMission(new SwapGeologyMission(this));

        if (!this.room.memory.swap) {
            console.log(`SWAP: indicating ${this.roomName} in Memory.rooms as swap room`);
            this.room.memory.swap = true;
        }

        if (!this.state.mineral.pos.lookFor(LOOK_STRUCTURES)[0]) {
            this.state.mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
        }
    }

    public update() {
        this.updateRemoteSpawn(1, 12900);
        if (!this.layout) { return; }
        this.builder.update();
        this.layout.update();

        if (this.room.hostiles.length > 0) {
            for (let tower of this.room.findStructures<StructureTower>(STRUCTURE_TOWER)) {
                tower.attack(this.room.hostiles[0]);
            }
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private autoLayout() {
        if (!this.room) { return; }
        if (!this.room.memory.layout) {
            this.room.memory.layout = {
                type: LAYOUT_SWAP,
                rotation: 0,
                anchor: {x: this.room.controller.pos.x, y: this.room.controller.pos.y},
                flex: undefined,
            };
        }

        this.layout = LayoutFactory.Instantiate(this.roomName);
        this.layout.init();
        this.builder = new LayoutBuilder(this.layout, this.roomName);
        this.builder.init();
    }
}