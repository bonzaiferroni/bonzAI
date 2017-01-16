import {SpawnGroup} from "./ai/SpawnGroup";
import {profiler} from "./profiler";
import {empire} from "./helpers/loopHelper";

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

        let testFlag = Game.flags["testerFlag"];
        if (testFlag) {
            let creepNames = ["travelTo"];
            for (let creepName of creepNames) {
                let creep = Game.creeps[creepName];
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
                    closest.spawn([MOVE], creepName, undefined, undefined);
                    continue;
                }

                if (creepName === "blindMoveTo") {
                    if (!creep.pos.inRangeTo(testFlag, 1)) {
                        profiler.start("blindMoveTo");
                        creep.blindMoveTo(testFlag);
                        profiler.end("blindMoveTo");
                    }
                }
                if (creepName === "travelTo") {
                    if (!creep.pos.inRangeTo(testFlag, 0)) {
                        let returnData: {nextPos?: RoomPosition} = {};
                        profiler.start("travelTo");
                        empire.traveler.travelTo(creep, testFlag, {preferHighway: true, returnData});
                        console.log(returnData.nextPos);
                        profiler.end("travelTo");
                    }
                }
            }
        }

        if (Game.time % 10 === 0) console.log(Memory.cpu.average);
    }
};
