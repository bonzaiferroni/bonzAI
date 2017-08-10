import {Operation} from "./ai/operations/Operation";
import {Mission} from "./ai/missions/Mission";
import {Agent} from "./ai/agents/Agent";
import {RoomHelper} from "./helpers/RoomHelper";
import {Notifier} from "./notifier";
import {empire} from "./ai/Empire";
import {helper} from "./helpers/helper";
import {Traveler} from "./ai/Traveler";
import {Profiler} from "./Profiler";
import {Viz} from "./helpers/Viz";
import {WorldMap} from "./ai/WorldMap";

export var sandBox = {
    run: function() {

        let bulldozeFlag = Game.flags["bulldoze"];
        if (bulldozeFlag && !bulldozeFlag.memory[bulldozeFlag.pos.roomName]) {

            if (bulldozeFlag.room && bulldozeFlag.room.controller.my) {
                bulldozeFlag.room.findStructures<StructureWall>(STRUCTURE_WALL)
                    .forEach(x => x.destroy());
                bulldozeFlag.room.controller.unclaim();
                bulldozeFlag.memory[bulldozeFlag.pos.roomName] = true;
            } else {
                let bulldozer = Game.creeps["bulldozer"];
                if (bulldozer) {
                    if (bulldozer.pos.inRangeTo(bulldozeFlag, 0)) {
                        bulldozer.claimController(bulldozer.room.controller);
                    } else {
                        bulldozer.travelTo(bulldozeFlag);
                    }
                } else {
                    empire.spawnFromClosest(bulldozeFlag.pos.roomName, [CLAIM, MOVE], "bulldozer");
                }
            }
        }

        let claimerFlag = Game.flags["claimerFlag"];
        if (claimerFlag) {
            let creep = Game.creeps["claimer"];
            if (creep) {
                creep.travelTo(claimerFlag, {offRoad: true});
                creep.claimController(creep.room.controller);
            } else {
                empire.spawnFromClosest(claimerFlag.pos.roomName, [CLAIM, MOVE], "claimer");
                // empire.spawnFromClosest(claimerFlag.pos, [CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE], "claimer");
            }
        }

        let signerFlag = Game.flags["signerFlag"];
        let sign = "bad command or file name";
        if (signerFlag && (!signerFlag.room.controller.sign || signerFlag.room.controller.sign.text !== sign)) {
            let creep = Game.creeps["signer"];
            if (creep) {
                let data = {} as TravelToReturnData;
                creep.travelTo(signerFlag, {returnData: data});
                if (data.path) { creep.say(`${data.path.length} more!`); }
                creep.signController(creep.room.controller, sign);
            } else {
                empire.spawnFromClosest(signerFlag.pos.roomName, [MOVE], "signer");
            }
        }

        if (Game.time % 12 === 0) {
            console.log(`time: ${Game.time}, cpu: ${_.round(Memory.cpu.average, 2)}`, "perCreep: " +
                _.round(Memory.cpu.average / Object.keys(Game.creeps).length, 2));
        }

        nukePos();
    },
};

function nukePos() {
    if (!Memory.temp.nukePos) { return; }
    if (!Memory.temp.nukeCount) { return; }
    if (Game.time < Memory.temp.nextNuke) { return; }
    if (!Memory.temp.nukeDelay) { Memory.temp.nukeDelay = 248; }
    let position = helper.deserializeRoomPosition(Memory.temp.nukePos);
    for (let roomName in empire.spawnGroups) {
        if (Game.map.getRoomLinearDistance(position.roomName, roomName) > 10) { continue; }
        let room = Game.rooms[roomName];
        let nuker = room.findStructures<StructureNuker>(STRUCTURE_NUKER)[0];
        if (!nuker) { continue; }
        let outcome = nuker.launchNuke(position);
        console.log(`${roomName} is nuking ${position}, outcome: ${outcome}`);
        if (outcome === OK) {
            Memory.temp.nukeCount--;
            Memory.temp.nextNuke = Game.time + Memory.temp.nukeDelay;
            return;
        }
    }

    console.log("all nukes in range have been launched");
    Memory.temp.nukePos =  undefined;
}

function testFunction() {
    let cpu = Game.cpu.getUsed();

    console.log(`operator: ${Game.cpu.getUsed() - cpu}`);

    cpu = Game.cpu.getUsed();

    console.log(`function: ${Game.cpu.getUsed() - cpu}`);
}
