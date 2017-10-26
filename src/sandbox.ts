import {Notifier} from "./notifier";
import {empire} from "./ai/Empire";
import {helper} from "./helpers/helper";
import {Traveler} from "./Traveler/Traveler";

export var sandBox = {
    run: function() {

        // pathTest();

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
                Game.spawns.Spawn1.createCreep([CLAIM, MOVE], "claimer");
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
            console.log(`*** time: ${Game.time}, cpu: ${_.round(Memory.cpu.average, 2)}`, "perCreep: " +
                _.round(Memory.cpu.average / Object.keys(Game.creeps).length, 2), "***");
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

function pathTest() {
    let range = 0;
    if (Memory.temp.range) {
        range = Memory.temp.range;
    }
    let pathTargets: {pos: RoomPosition, range: number}[] = [];
    for (let i = 1; i < 20; i++) {
        let flagName = `Flag${i}`;
        let flag = Game.flags[flagName];
        if (flag) {
            pathTargets.push({pos: flag.pos, range: range});
        }
    }

    if (pathTargets.length === 0) { return; }

    let creep = Game.creeps["pathTester"];
    if (!creep) {
        empire.spawnFromClosest(pathTargets[0].pos.roomName, [MOVE], "pathTester", true);
        return;
    }

    let cpu = Game.cpu.getUsed();
    let ret = PathFinder.search(creep.pos, pathTargets, {
        flee: Memory.temp.flee,
        maxOps: 20000,
    });
    cpu = _.round(Game.cpu.getUsed() - cpu, 3);
    if (!Memory.temp.cpuAvg) { Memory.temp.cpuAvg = []; }
    Memory.temp.cpuAvg.push(cpu);
    let cpuAvg = _.round(_.sum(Memory.temp.cpuAvg) / Memory.temp.cpuAvg.length, 3);
    while (Memory.temp.cpuAvg.length > 10) { Memory.temp.cpuAvg.shift(); }

    let msg = `${
        _.padRight(`cpu: ${cpu}`, 16)}${
        _.padRight(`avg: ${cpuAvg}`, 16)}${
        _.padRight(`ops: ${ret.ops}`, 16)}${
        _.padRight(`inc: ${ret.incomplete}`, 16)}${
        _.padRight(`len: ${ret.path.length}`, 16)}`;
    console.log(msg);
    let color = "cyan";
    if (ret.incomplete) {
        color = "magenta;";
    }
    Traveler.serializePath(creep.pos, ret.path, color);
    Notifier.addMessage(pathTargets[0].pos.roomName, msg);
    creep.moveByPath(ret.path);
}
