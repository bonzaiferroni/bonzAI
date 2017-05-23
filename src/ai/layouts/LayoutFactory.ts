import {QuadLayout} from "./QuadLayout";
import {Layout, LayoutData, LayoutType} from "./Layout";
import {MiniLayout} from "./MiniLayout";
import {FlexLayout} from "./FlexLayout";
export class LayoutFactory {

    public static layoutClasses = {
        [LayoutType.Quad]: QuadLayout,
        [LayoutType.Mini]: MiniLayout,
        [LayoutType.Flex]: FlexLayout,
    };

    public static Instantiate(roomName: string, data?: LayoutData): Layout {
        if (!data) {
            if (!Memory.rooms[roomName]) { Memory.rooms[roomName] = {} as any; }
            data = Memory.rooms[roomName].layout;
            if (!data) {
                return;
            }
        }
        let layoutClass = LayoutFactory.layoutClasses[data.type];
        return new layoutClass(roomName, data.anchor, data.rotation);
    }
}
