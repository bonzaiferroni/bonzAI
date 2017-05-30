import {Operation} from "./Operation";
import {OperationPriority} from "../../config/constants";
import {Layout, LAYOUT_SWAP} from "../layouts/Layout";
import {LayoutFactory} from "../layouts/LayoutFactory";
import {LayoutBuilder} from "../layouts/LayoutBuilder";
import {ScoutMission} from "../missions/ScoutMission";
export class SwapOperation extends Operation {
    public layout: Layout;
    private builder: LayoutBuilder;

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.Low;
    }

    public init() {
        this.autoLayout();
    }

    public update() {
        if (!this.layout) { return; }
        this.builder.update();
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
            }
        }

        let layout = LayoutFactory.Instantiate(this.room.name);
        let initilized = layout.init();
        if (!initilized) { return; }
        this.layout = layout;

        this.builder = new LayoutBuilder(layout, this.roomName);
    }
}