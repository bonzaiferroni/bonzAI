import {Operation, OperationMemory} from "./Operation";
import {LayoutFinder} from "../layouts/LayoutFinder";
import {ROOMTYPE_ALLEY, WorldMap} from "../WorldMap";
import {helper} from "../../helpers/helper";
import {OperationPriority} from "../../config/constants";

interface LayoutOperationMemory extends OperationMemory {
    data: {
        ready: boolean,
        nearbyRooms: string[],
        checkedRooms: string[],
        sourcePositions: RoomPosition[],
        controllerPosition: RoomPosition,
        mineralPos: RoomPosition,
    };
}

export class LayoutOperation extends Operation {

    public memory: LayoutOperationMemory;

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.Low;
    }

    public init() {
    }

    public update() {
    }

    public finalize() {
        if (Memory.rooms[this.flag.pos.roomName].layout) {
            delete this.memory.data;
            let newFlagName = `control_${this.name}`;
            if (!this.room) {
                let observing = this.observeRoom(this.flag.pos.roomName);
                if (observing) {
                    return;
                } else {
                    console.log(`LAYOUT: you will need to create a flag manually: ${newFlagName} in ${this.room.name}`);
                    return;
                }
            }
            console.log(`planting new operation: ${newFlagName}`);
            this.flag.pos.createFlag(newFlagName, COLOR_GREY);
            this.flag.remove();
            console.log(`finished finding layout in ${this.flag.pos.roomName}, removing operation flag`);
            console.log(`may be some delay due to how flags work in rooms without vision, you can do this manually`);
            return;
        }
        if (!this.memory.data) {
            this.memory.data = {
                ready: false,
                nearbyRooms: undefined,
                checkedRooms: [],
                sourcePositions: [],
                controllerPosition: undefined,
                mineralPos: undefined,
            };
        }

        if (!this.memory.data.ready) {
            if (!this.memory.data.nearbyRooms) {
                let nearbyRooms = this.findNearbyRooms();
                nearbyRooms = this.filterByType(nearbyRooms);
                nearbyRooms = this.filterByPath(nearbyRooms);
                this.memory.data.nearbyRooms = nearbyRooms;
            }

            let observing = this.checkRooms();
            if (observing) { return; }
            this.memory.data.ready = true;
        }

        if (!this.memory.data.controllerPosition) {
            console.log("FINDER: something went wrong, no controller position available");
            console.log("finder requires vision in room or observer in range");
            console.log(`delete ${this.name}.memory.data to try again`);
            return;
        }

        let finder = new LayoutFinder(this.flag.pos.roomName);
        finder.init({
            sourcePositions: this.memory.data.sourcePositions,
            controllerPos: this.memory.data.controllerPosition,
            mineralPos: this.memory.data.mineralPos,
        });
        finder.run();
    }

    public invalidateCache() {
    }

    private findNearbyRooms(): string[] {
        if (this.flag.pos.roomName === "sim") { return [this.flag.pos.roomName]; }
        let radius = 1;
        let roomNames = [];
        for (let xDelta = -radius; xDelta <= radius; xDelta++) {
            for (let yDelta = -radius; yDelta <= radius; yDelta++) {
                let roomName = WorldMap.findRelativeRoomName(this.flag.pos.roomName, xDelta, yDelta);
                roomNames.push(roomName);
            }
        }
        return roomNames;
    }

    private filterByType(nearbyRooms: string[]): string[] {
        return _(nearbyRooms).filter(x => WorldMap.roomTypeFromName(x) !== ROOMTYPE_ALLEY).value();
    }

    private filterByPath(nearbyRooms: string[]) {
        return _(nearbyRooms).filter((x: string) => {
            let a = helper.pathablePosition(this.flag.pos.roomName);
            let b = helper.pathablePosition(x);
            let ret = PathFinder.search(a, b);
            return !ret.incomplete;
        }).value();
    }

    private checkRooms(): boolean {

        for (let roomName of this.memory.data.nearbyRooms) {
            if (_.includes(this.memory.data.checkedRooms, roomName)) { continue; }
            let room = Game.rooms[roomName];
            if (room) {
                this.memory.data.checkedRooms.push(roomName);
                let sources = room.find<Source>(FIND_SOURCES);
                this.memory.data.sourcePositions = this.memory.data.sourcePositions.concat(_.map(sources, x => x.pos));
                if (roomName === this.flag.pos.roomName) {
                    if (!room.controller) {
                        console.log(`FINDER: unable to find layout in ${room.name}, no controller`);
                        this.flag.remove();
                        return;
                    }

                    this.memory.data.controllerPosition = room.controller.pos;
                    this.memory.data.mineralPos = room.find<Source>(FIND_MINERALS)[0].pos;
                }
            } else {
                let observing = this.observeRoom(roomName);
                if (observing) { return true; }
            }
        }
    }

    private observeRoom(roomName: string): boolean {
        for (let spawnName in Game.spawns) {
            let spawn = Game.spawns[spawnName];
            if (Game.map.getRoomLinearDistance(roomName, spawn.pos.roomName) > OBSERVER_RANGE) { continue; }
            if (spawn.room.controller.level < 8) { continue; }
            let observer = _(spawn.room.find<Structure>(FIND_STRUCTURES))
                .filter(x => x.structureType === STRUCTURE_OBSERVER)
                .head() as StructureObserver;
            if (!observer) { continue; }
            observer.observeRoom(roomName, "layout", true);
            console.log(`FINDER: ordering observer vision in ${roomName}`);
            return true;
        }
    }
}
