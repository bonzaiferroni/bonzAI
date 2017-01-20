import {SpawnGroup} from "./ai/SpawnGroup";
import {Profiler} from "./Profiler";
import {empire} from "./helpers/loopHelper";
import {helper} from "./helpers/helper";

export var sandBox = {
    run: function() {
        let claimerFlag = Game.flags["claimerFlag"];
        if (claimerFlag) {
            let claimer = Game.creeps["claimer"];
            if (!claimer) {
                let closest: SpawnGroup;
                let bestDistance = Number.MAX_VALUE;
                for (let roomName in empire.spawnGroups) {
                    let distance = Game.map.getRoomLinearDistance(claimerFlag.pos.roomName, roomName);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        closest = empire.spawnGroups[roomName];
                    }
                }
                closest.spawn([CLAIM, MOVE], "claimer", undefined, undefined);
                return;
            }
            if (claimer.pos.inRangeTo(claimerFlag, 0)) {
                claimer.claimController(claimer.room.controller);
                console.log("### claimer waiting");
            }
            else {
                empire.traveler.travelTo(claimer, claimerFlag);
            }
        }

        // pathTest2();

        if (Game.time % 10 === 0) console.log(_.round(Memory.cpu.average, 2));
    }
};

function pathTest() {
    if (!Memory.temp.pathTest) { return; }

    let startFlag = Game.flags["start"];
    let endFlag = Game.flags["end"];
    if (!startFlag || !endFlag) { return; }

    let distances = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500];

    if (!Memory.temp.pathData || helper.deserializeRoomPosition(Memory.temp.pathData.pathDest).getRangeTo(endFlag) > 0) {
        Memory.temp.pathData = {
            pathDest: endFlag.pos,
            testCount: 0,
        };
    }

    let data = Memory.temp.pathData;
    if (!data.path) {
        let routeRooms = empire.traveler.findAllowedRooms(startFlag.pos.roomName, endFlag.pos.roomName);
        if (!routeRooms) {
            console.log(`route unsuccessful`);
            return;
        }
        let roomCount = 0;
        let ret = PathFinder.search(startFlag.pos, endFlag.pos, {
            roomCallback: (roomName: string) => {
                if (!routeRooms[roomName]) return false;
                roomCount++;
                if (Game.rooms[roomName]) {
                    return empire.traveler.getStructureMatrix(Game.rooms[roomName])
                }
            },
            maxOps: 20000,
        });
        if (ret.incomplete) {
            console.log(`path unsuccesful, ops: ${ret.ops}, roomCount: ${roomCount}`);
            return;
        }

        if (ret.path.length < _.last(distances)) {
            console.log(`path not long enough, ops: ${ret.ops}, roomCount: ${roomCount}, length: ${ret.path.length}`);
            return;
        }

        console.log(`test path successful`);
        helper.debugPath(ret.path);
        data.path = ret.path;
    }

    let destinations = _.map(distances, d => helper.deserializeRoomPosition(data.path[d]));

    let inPosition: Creep[] = [];
    let moveTypes = ["trav", "move"];
    for (let moveType of moveTypes) {
        let testFlag = Game.flags[moveType];
        if (testFlag) {
            let creep = Game.creeps[moveType];
            if (!creep) {
                let closest: SpawnGroup;
                let bestDistance = Number.MAX_VALUE;
                for (let roomName in empire.spawnGroups) {
                    let distance = Game.map.getRoomLinearDistance(testFlag.pos.roomName, roomName);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        closest = empire.spawnGroups[roomName];
                    }
                }
                closest.spawn([MOVE], moveType, undefined, undefined);
                continue;
            }

            if (!creep.pos.inRangeTo(testFlag, 0)) {
                empire.traveler.travelTo(creep, testFlag);
            }
            else {
                inPosition.push(creep);
            }
        }
    }

    if (inPosition.length < 2 || data.testCount >= 50) { return; }
    if (data.testCount === 0) {
        console.log(`beginning path test`);
    }
    if (data.testCount % 10 === 0) {
        console.log(`test #${data.testCount}`)
    }



    for (let creep of inPosition) {

        // get initial movement out of the way
        Profiler.start("test." + creep.name + ".init");
        if (creep.name === "trav") {
            empire.traveler.travelTo(creep, startFlag);
        } else { // (moveType === "move")
            creep.blindMoveTo(startFlag);
        }
        Profiler.end("test." + creep.name + ".init");

        for (let i = 0; i < distances.length; i++) {
            let dest = {pos: destinations[i]};
            delete creep.memory._travel;
            delete creep.memory._move;
            let cpu = Game.cpu.getUsed();
            Profiler.start("test." + creep.name + ".dist" + distances[i]);
            if (creep.name === "trav") {
                empire.traveler.travelTo(creep, dest);
            } else { // (moveType === "move")
                creep.blindMoveTo(dest);
            }
            Profiler.end("test." + creep.name + ".dist" + distances[i]);
            if (data.testCount % 10 === 0) {
                console.log(`${creep.name}, distance: ${distances[i]}, cpu: ${Game.cpu.getUsed() - cpu}`);
            }
        }

        creep.cancelOrder("move");
    }

    data.testCount++;
}


function pathTest2() {
    if (!Memory.temp.pathTest) {
        return;
    }

    let startFlag = Game.flags["start"];
    let endFlag = Game.flags["end"];
    if (!startFlag || !endFlag) {
        return;
    }

    let distances = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500];

    if (!Memory.temp.pathData || helper.deserializeRoomPosition(Memory.temp.pathData.pathDest).getRangeTo(endFlag) > 0) {
        Memory.temp.pathData = {
            pathDest: endFlag.pos,
            testCount: 0,
        };
    }

    let data = Memory.temp.pathData;
    if (!data.path) {
        let routeRooms = empire.traveler.findAllowedRooms(startFlag.pos.roomName, endFlag.pos.roomName);
        if (!routeRooms) {
            console.log(`route unsuccessful`);
            return;
        }
        let roomCount = 0;
        let ret = PathFinder.search(startFlag.pos, endFlag.pos, {
            roomCallback: (roomName: string) => {
                if (!routeRooms[roomName]) return false;
                roomCount++;
                if (Game.rooms[roomName]) {
                    return empire.traveler.getStructureMatrix(Game.rooms[roomName])
                }
            },
            maxOps: 20000,
        });
        if (ret.incomplete) {
            console.log(`path unsuccesful, ops: ${ret.ops}, roomCount: ${roomCount}`);
            return;
        }

        if (ret.path.length < _.last(distances)) {
            console.log(`path not long enough, ops: ${ret.ops}, roomCount: ${roomCount}, length: ${ret.path.length}`);
            return;
        }

        console.log(`test path successful`);
        helper.debugPath(ret.path);
        data.path = ret.path;
    }

    let destinations = _.map(distances, d => helper.deserializeRoomPosition(data.path[d]));

    let inPosition: Creep[] = [];
    let moveTypes = ["trav", "move"];
    for (let moveType of moveTypes) {
        let testFlag = Game.flags[moveType];
        if (testFlag) {
            let creep = Game.creeps[moveType];
            if (!creep) {
                let closest: SpawnGroup;
                let bestDistance = Number.MAX_VALUE;
                for (let roomName in empire.spawnGroups) {
                    let distance = Game.map.getRoomLinearDistance(testFlag.pos.roomName, roomName);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        closest = empire.spawnGroups[roomName];
                    }
                }
                closest.spawn([MOVE], moveType, undefined, undefined);
                continue;
            }

            if (!creep.pos.inRangeTo(testFlag, 0)) {
                empire.traveler.travelTo(creep, testFlag);
            }
            else {
                inPosition.push(creep);
            }
        }
    }

    if (inPosition.length < 2) {
        return;
    }
    if (data.testCount === 0) {
        console.log(`beginning path test`);
    }
    if (data.testCount % 10 === 0) {
        console.log(`test #${data.testCount}`)
    }


    let cpu = Game.cpu.getUsed();
    for (let creep of inPosition) {

        if (data.testCount < data.path.length) {
            delete creep.memory._travel;
            delete creep.memory._move;
            let dest = {pos: helper.deserializeRoomPosition(data.path[data.testCount])};
            Profiler.start("test." + creep.name + ".test2");
            if (creep.name === "trav") {
                empire.traveler.travelTo(creep, dest);
            } else { // (moveType === "move")
                creep.blindMoveTo(dest);
            }
            Profiler.end("test." + creep.name + ".test2");
            creep.cancelOrder("move");
        }
        else {
            Profiler.start("test." + creep.name + ".test2");
            Profiler.end("test." + creep.name + ".test2");
        }
    }

    if (data.testCount % 5 === 0) {
        if (data.testCount < data.path.length) {
            console.log(`pathing to position ${data.testCount}, total cpu: ${Game.cpu.getUsed() - cpu}`);
        }
        else {
            console.log(`test complete`)
        }
    }
    data.testCount++;
}