import {LAYOUT_FLEX, LAYOUT_MINI, LAYOUT_QUAD, LAYOUT_SEGMENTID, LayoutType} from "./ai/layouts/Layout";
import {MemHelper} from "./helpers/MemHelper";
import {helper} from "./helpers/helper";
export class Patcher {

    public static checkPatch(): boolean {
        if (Memory.version === CURRENT_VERSION) { return false; }

        if (this.detectSim()) { return true; }
        if (this.memSegmentInit(Memory.version)) { return true; }
        if (this.quadAndFlexToControl(Memory.version)) { return true; }
        if (this.patchLayoutEnumToString(Memory.version)) { return true; }

        Memory.version = CURRENT_VERSION;
        console.log(`PATCHER: updated to bonzAI v${CURRENT_VERSION}`);
        return true;
    }

    private static memSegmentInit(version: number) {
        if (version > 3) { return false; }

        RawMemory.setActiveSegments([LAYOUT_SEGMENTID]);
        if (!_.includes(Object.keys(RawMemory.segments), `${LAYOUT_SEGMENTID}`)) {
            console.log("ordering active segment");
            return true;
        }

        let flexMapsJson = RawMemory.segments[LAYOUT_SEGMENTID];
        if (flexMapsJson === undefined || flexMapsJson.length === 0) {
            console.log(`initializing segment ${LAYOUT_SEGMENTID} to be used with storing layouts`);
            RawMemory.segments[LAYOUT_SEGMENTID] = "{}";
            return true;
        }
    }

    private static quadAndFlexToControl(version: number) {
        if (version > 3) { return false; }

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
                        type: LAYOUT_QUAD,
                        rotation: currentFlag.memory.rotation,
                    };
                } else {
                    let flexMap = {};
                    for (let structureType in currentFlag.memory.layoutMap) {
                        let positions = _(currentFlag.memory.layoutMap[structureType])
                            .map(x => helper.coordToPosition(x, currentFlag.memory.centerPosition,
                                currentFlag.memory.rotation))
                            .value();
                        flexMap[structureType] = MemHelper.serializeIntPositions(positions);
                    }

                    if (!flexMap) {
                        console.log("bad mapping");
                        return true;
                    }

                    flexMaps[room.name] = flexMap;

                    room.memory.layout = {
                        anchor: currentFlag.memory.centerPosition,
                        type: LAYOUT_FLEX,
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

    private static patchLayoutEnumToString(version: number) {
        if (version > 3.1) { return false; }

        let layoutTypes = {
            [LayoutType.Quad]: LAYOUT_QUAD,
            [LayoutType.Flex]: LAYOUT_FLEX,
            [LayoutType.Mini]: LAYOUT_MINI,
        };

        console.log("patching layout enum to string");
        for (let roomName in Memory.rooms) {
            let memory = Memory.rooms[roomName];
            if (memory.layout && memory.layout.type !== undefined) {
                let newType = layoutTypes[memory.layout.type];
                if (newType === undefined) { continue; }
                console.log(`changing type ${memory.layout.type} to ${newType}`);
                memory.layout.type = newType;
            }
        }
        console.log("done");
    }

    private static detectSim() {
        for (let roomName in Game.rooms) {
            if (roomName === "sim") {
                console.log("bonzai cannot currently run in the sim because it does not support memory segments");
                Memory.version = CURRENT_VERSION;
                return true;
            }
        }
    }
}

export const CURRENT_VERSION = 3.1;
