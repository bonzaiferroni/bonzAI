export var sandBox = {
    run: function() {

        let claimerFlag = Game.flags["duderFlag"];
        if (claimerFlag) {
            let claimer = Game.creeps["duder"];
            if (!claimer) {
                Game.spawns["Spawn7"].createCreep([CLAIM, MOVE], "duder");
                return;
            }
            if (claimer.pos.inRangeTo(claimerFlag, 0)) {
                claimer.claimController(claimer.room.controller);
                console.log("### duder waiting");
            }
            else {
                claimer.avoidSK(claimerFlag);
            }
        }

        let scoutFlag = Game.flags["peetaFlag"];
        if (scoutFlag) {
            let scout = Game.creeps["peeta"];
            if (!scout) {
                Game.spawns["Spawn2"].createCreep([MOVE], "peeta");
                return;
            }
            if (scout.pos.inRangeTo(scoutFlag, 0)) {
                scout.signController(scout.room.controller, "I'm going to claim this room in a few days. I warned ya!");
                console.log("### scpit waiting");
                scoutFlag.remove();
            }
            else {
                scout.avoidSK(scoutFlag);
            }
        }

        let remoteFlag = Game.flags["remoteRoom1"];
        if (remoteFlag) {
            if (remoteFlag.room) {
                // all activities like mining relative to this room
                let spawn = remoteFlag.room.find(FIND_MY_SPAWNS)[0];
                if (spawn) {
                    // typical spawn code in remote room,
                }
                let sources = remoteFlag.room.find(FIND_SOURCES);
            }
            else {
                // spawn a scout if room doesn't have vision
                let scout = Game.creeps["remoteRoom1Scout"];
                if (scout) {
                    if (!scout.pos.isNearTo(remoteFlag)) {
                        scout.moveTo(remoteFlag);
                    }
                }
                else {
                    Game.spawns["Spawn1"].createCreep([MOVE], "remoteRoom1Scout");
                }
            }
        }

        let flag = Game.flags["attackFlag"];
        if (flag) {
            let creep = Game.creeps["attacker"];
            if (creep) {
                if (creep.pos.isNearTo(flag)) {
                    var structure = flag.pos.lookFor<Structure>(LOOK_STRUCTURES)[0];
                    if (structure) {
                        creep.attack(structure);
                    }
                }
                else {
                    creep.moveTo(flag, {ignoreDestructibleStructures: true});
                }
            }
            else {
                Game.spawns["Spawn3"].createCreep([TOUGH, TOUGH, MOVE, MOVE, MOVE, ATTACK], "attacker")
            }
        }

        if (!Memory["ranTest"]) {
            Memory["ranTest"] = true;

            let structure = Game.spawns["Spawn1"];

            let cpu = Game.cpu.getUsed();

            for (let i = 0; i < 10000; i++) {
                structure.structureType === STRUCTURE_SPAWN;
            }
            console.log("comparison: " + (Game.cpu.getUsed() - cpu));
            cpu = Game.cpu.getUsed();

            for (let i = 0; i < 10000; i++) {
                structure instanceof StructureSpawn
            }

            console.log("instanceof: " + (Game.cpu.getUsed() - cpu));
        }
    }
};