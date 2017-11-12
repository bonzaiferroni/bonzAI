import {Operation, OperationMemory} from "./Operation";
import {LayoutFinder} from "../layouts/LayoutFinder";
import {ROOMTYPE_ALLEY, WorldMap} from "../WorldMap";
import {helper} from "../../helpers/helper";
import {OperationPriority} from "../../config/constants";
import {PosHelper} from "../../helpers/PosHelper";
import {Observationer} from "../Observationer";
import {empire} from "../Empire";

interface LayoutOperationMemory extends OperationMemory {
    blind: boolean;
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
        if (!this.room && !this.memory.blind) {
            Observationer.observeRoom(this.roomName, 0);
            return;
        }

        if (Memory.rooms[this.flag.pos.roomName].layout) {
            delete this.memory.data;
            let newFlagName = `control_${this.name}`;
            if (!this.room) {
                Observationer.observeRoom(this.flag.pos.roomName, 2);
                return;
            }
            console.log(`planting new operation: ${newFlagName}`);
            empire.addOperation("control", this.flag.pos);
            if (empire.cpuAvailable(30)) {
                empire.addOperation("swarm", this.flag.pos, undefined, false);
            }
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
            console.log(JSON.stringify(this.memory.data.nearbyRooms));
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
        let newRoom = Object.keys(empire.map.controlledRooms).length === 1;
        // if (this.flag.pos.roomName === "sim" || newRoom) { return [this.flag.pos.roomName]; }
        // disabled multiroom scanning for now
        if (this.flag.pos.roomName) { return [this.flag.pos.roomName]; }
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
        return _(nearbyRooms).filter(x => WorldMap.roomType(x) !== ROOMTYPE_ALLEY).value();
    }

    private filterByPath(nearbyRooms: string[]) {
        return _(nearbyRooms).filter((x: string) => {
            let a = PosHelper.pathablePosition(this.flag.pos.roomName);
            let b = PosHelper.pathablePosition(x);
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
                Observationer.observeRoom(roomName, 2);
                return true;
            }
        }
    }
}
