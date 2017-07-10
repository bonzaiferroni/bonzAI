import {Traveler} from "../ai/Traveler";
export class PosHelper {
    public static findClosestByPath<T extends {pos: RoomPosition}>(origin: RoomPosition, destinations: T[],
                                                                   ignoreStructures = true, ignoreSwamps = true,
                                                                   range = 1): T {
        let goals = _.map(destinations, x => {
            return {pos: x.pos, range: range};
        });
        let ret = PathFinder.search(origin, goals, {
            swampCost: ignoreSwamps ? 1 : 5,
            roomCallback: (roomName: string) => {
                if (ignoreStructures) { return; }
                let room = Game.rooms[roomName];
                if (!room) { return; }
                return Traveler.getStructureMatrix(room);
            },
        });

        if (ret.incomplete) { return; }
        let closest = _.min(destinations, x => x.pos.getRangeTo(_.last(ret.path)));
        if (_.isObject(closest)) { return closest; }
    }
}