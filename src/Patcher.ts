import {LAYOUT_SEGMENTID, LayoutType} from "./ai/layouts/Layout";
import {Mem} from "./helpers/Mem";
import {helper} from "./helpers/helper";
export class Patcher {

    public static checkPatch(): boolean {
        if (Memory.version === CURRENT_VERSION) { return false; }

        if (this.controllerOpToOwnedOp()) { return true; }

        Memory.version = CURRENT_VERSION;
        console.log(`PATCHER: updated to bonzAI v${CURRENT_VERSION}`);
        return true;
    }

    private static controllerOpToOwnedOp() {
        let types = ["quad", "flex"];
        for (let flagName in Game.flags) {
            for (let type of types) {
                if (flagName.indexOf(type) < 0) { continue; }
                let currentname = flagName.substring(flagName.indexOf("_") + 1);
                let currentFlag = Game.flags[flagName];
                let room = currentFlag.room;

                if (!room) {
                    console.log(`no vision in ${currentFlag.pos.roomName}`);
                    return true;
                }

                // save cached layout data
                RawMemory.setActiveSegments([LAYOUT_SEGMENTID]);
                let flexMapsJson = RawMemory.segments[LAYOUT_SEGMENTID];
                if (!flexMapsJson) {
                    console.log("ordering active segments");
                    return true;
                }

                let flexMaps = JSON.parse(flexMapsJson);
                if (!flexMaps) {
                    console.log("bad json");
                    return true;
                }

                if (type === "quad") {
                    console.log(`saved quad layout for ${currentname}`);
                    room.memory.layout = {
                        anchor: currentFlag.memory.centerPosition,
                        type: LayoutType.Quad,
                        rotation: currentFlag.memory.rotation,
                    };
                } else {
                    let flexMap = {};
                    for (let structureType in currentFlag.memory.layoutMap) {
                        let positions = _(currentFlag.memory.layoutMap[structureType])
                            .map(x => helper.coordToPosition(x, currentFlag.memory.centerPosition,
                                currentFlag.memory.rotation))
                            .value();
                        flexMap[structureType] = Mem.serializeIntPositions(positions);
                    }

                    if (!flexMap) {
                        console.log("bad mapping");
                        return true;
                    }

                    flexMaps[room.name] = flexMap;

                    room.memory.layout = {
                        anchor: currentFlag.memory.centerPosition,
                        type: LayoutType.Flex,
                        rotation: currentFlag.memory.rotation,
                    };
                }

                RawMemory.segments[LAYOUT_SEGMENTID] = JSON.stringify(flexMaps);

                let newName = `control_${currentname}`;
                currentFlag.pos.createFlag(newName, COLOR_GREY);
                Memory.flags[newName] = {
                    power: currentFlag.memory.power,
                };

                delete Memory.flags[flagName];
                currentFlag.remove();
            }
        }
    }
}

export const CURRENT_VERSION = 3;
