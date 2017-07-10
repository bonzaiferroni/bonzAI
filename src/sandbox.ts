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
                    empire.spawnFromClosest(bulldozeFlag.pos, [CLAIM, MOVE], "bulldozer");
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
                empire.spawnFromClosest(claimerFlag.pos, [CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE], "claimer");
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
                empire.spawnFromClosest(signerFlag.pos, [MOVE], "signer");
            }
        }

        if (!Memory.temp.ranTest) {
            Memory.temp.ranTest = true;
            let place1 = Game.flags["keeper_lima6"];
            let destinations = _.toArray(empire.spawnGroups);
            let selected = RoomHelper.findClosest(place1, destinations, {margin: 50});
            console.log(`selected the following: `);
            for (let value of selected) { console.log(value.destination.pos); }
        }

        if (Game.time % 10 === 0) {
            console.log("cpu: " + _.round(Memory.cpu.average, 2), "perCreep: " +
                _.round(Memory.cpu.average / Object.keys(Game.creeps).length, 2));
        }

        if (Memory.temp.test) {
            // testSerialPos();
            testFunction();
            Memory.temp.test = undefined;
        }

        nukePos();
    },
};

function nukePos() {
    if (!Memory.temp.nukePos) { return; }
    if (Game.time < Memory.temp.nextNuke) { return; }
    let position = helper.deserializeRoomPosition(Memory.temp.nukePos);
    for (let roomName in empire.spawnGroups) {
        if (Game.map.getRoomLinearDistance(position.roomName, roomName) > 10) { continue; }
        let room = Game.rooms[roomName];
        let nuker = room.findStructures<StructureNuker>(STRUCTURE_NUKER)[0];
        if (!nuker) { continue; }
        let outcome = nuker.launchNuke(position);
        console.log(`${roomName} is nuking ${position}, outcome: ${outcome}`);
        if (outcome === OK) {
            Memory.temp.nextNuke = Game.time + 300;
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

function testSerialPos() {
    let room = Game.spawns["Spawn1"].room;
    let positions = room.find<Structure>(FIND_STRUCTURES).map(s => s.pos);
    let jsons = positions.map(p => { return {x: p.x, y: p.y, roomName: p.roomName}; });
    let integers = positions.map(p => room.serializePosition(p));
    let unicodes = positions.map(p => room.serializePositionTest(p));

    console.log("\nthese compare what the overhead per tick would be for just storage");
    let cpu = Game.cpu.getUsed();
    for (let i = 0; i < 100; i++) {
        let str = JSON.stringify(jsons);
        JSON.parse(str);
    }
    console.log(`nonserialized: ${Game.cpu.getUsed() - cpu}`);
    cpu = Game.cpu.getUsed();
    for (let i = 0; i < 100; i++) {
        let str = JSON.stringify(integers);
        JSON.parse(str);
    }
    console.log(`type 1: ${Game.cpu.getUsed() - cpu}`);
    cpu = Game.cpu.getUsed();
    for (let i = 0; i < 100; i++) {
        let str = JSON.stringify(unicodes);
        JSON.parse(str);
    }
    console.log(`type 2: ${Game.cpu.getUsed() - cpu}`);

    console.log("\nthese compare the cost for deserialization");
    cpu = Game.cpu.getUsed();
    for (let json of jsons) {
        let position = new RoomPosition(json.x, json.y, json.roomName);
    }
    console.log(`json: ${Game.cpu.getUsed() - cpu}`);
    cpu = Game.cpu.getUsed();
    for (let json of jsons) {
        let position = _.create(json);
    }
    console.log(`json (lodash): ${Game.cpu.getUsed() - cpu}`);
    cpu = Game.cpu.getUsed();
    for (let integer of integers) {
        let position = room.deserializePosition(integer);
    }
    console.log(`integer: ${Game.cpu.getUsed() - cpu}`);
    cpu = Game.cpu.getUsed();
    for (let unicode of unicodes) {
        let position = room.deserializePositionTest(unicode);
    }
    console.log(`unicode: ${Game.cpu.getUsed() - cpu}`);
}
