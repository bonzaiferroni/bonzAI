import {QuadLayout} from "./QuadLayout";
import {
    Layout, LAYOUT_CUSTOM, LAYOUT_FLEX, LAYOUT_MINI, LAYOUT_PLUS, LAYOUT_QUAD, LAYOUT_SWAP, LAYOUT_TREE, LayoutData,
} from "./Layout";
import {MiniLayout} from "./MiniLayout";
import {FlexLayout} from "./FlexLayout";
import {CustomLayout} from "./CustomLayout";
import {SwapLayout} from "./SwapLayout";
import {PlusLayout} from "./PlusLayout";
import {TreeLayout} from "./TreeLayout";
export class LayoutFactory {

    public static layoutClasses = {
        [LAYOUT_QUAD]: QuadLayout,
        [LAYOUT_MINI]: MiniLayout,
        [LAYOUT_FLEX]: FlexLayout,
        [LAYOUT_SWAP]: SwapLayout,
        [LAYOUT_PLUS]: PlusLayout,
        [LAYOUT_TREE]: TreeLayout,
        [LAYOUT_CUSTOM]: CustomLayout,
    };

    public static Instantiate(roomName: string, type?: string): Layout {
        if (!type) {
            if (!Memory.rooms[roomName]) { Memory.rooms[roomName] = {} as any; }
            let data = Memory.rooms[roomName].layout;
            if (!data) {
                if (Game.time % 10 === 0) {
                    console.log(`LAYOUT: no auto-layout type specified for ${roomName}`);
                }
                data = {
                    flex: true,
                    anchor: {x: 0, y: 0},
                    rotation: 0,
                    type: LAYOUT_CUSTOM,
                };
                Memory.rooms[roomName].layout = data;
            }
            type = data.type;
        }

        let layoutClass = LayoutFactory.layoutClasses[type];
        return new layoutClass(roomName);
    }
}
