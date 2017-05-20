import {Operation} from "./Operation";
import {notifier} from "../../notifier";
import {empire} from "../Empire";
import {helper} from "../../helpers/helper";
import {OperationPriority} from "../../config/constants";
export class EvacOperation extends Operation {

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.High;
    }

    public memory: {
        ids: string[];
    };

    public initOperation() {
    }

    public finalizeOperation() {
        let soonestNuke = _(this.room.find<Nuke>(FIND_NUKES)).sortBy(x => x.timeToLand).head();
        if (!soonestNuke) {
            notifier.log(`evacuation complete in ${this.flag.room}`);
            this.memory.ids = undefined;
            this.flag.remove();
            return;
        }

        console.log(soonestNuke.timeToLand);
        if (soonestNuke.timeToLand < 80) {
            if (!this.memory.ids) {
                this.memory.ids = _(this.room.find<Creep>(FIND_MY_CREEPS)).map(x => x.id).value();
            }
            let creeps = _(this.memory.ids)
                .filter(x => Game.getObjectById<Creep>(x))
                .map(x => Game.getObjectById<Creep>(x))
                .value();
            let fleeOrientation = helper.pathablePosition(this.room.name);
            for (let creep of creeps) {
                this.fleeRoom(creep, fleeOrientation);
            }

            for (let newCreep of this.room.find<Creep>(FIND_MY_CREEPS)) {
                if (_.includes(creeps, newCreep)) { continue; }
                this.memory.ids.push(newCreep.id);
            }
        } else {
            this.memory.ids = undefined;
        }
    }

    public invalidateOperationCache() {
    }

    private fleeRoom(creep: Creep, fleePos: RoomPosition) {
        if (!creep) { return; }
        creep.cancelOrder("move");
        if (creep.room !== this.room && !creep.pos.isNearExit(4)) {
            return;
        }

        if (!creep.memory.dest) {
            let ret = PathFinder.search(creep.pos, {pos: fleePos, range: 50 }, {flee: true});
            let last = _.last(ret.path);
            if (last && last.roomName !== this.room.name) {
                creep.memory.dest = last;
            } else {
                console.log(`no valid path for ${creep.name} at ${creep.pos}`);
                return;
            }
        }

        let pos = helper.deserializeRoomPosition(creep.memory.dest);
        creep.moveTo(pos);
    }
}
