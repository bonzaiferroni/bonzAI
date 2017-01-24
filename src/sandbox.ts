import {empire} from "./helpers/loopHelper";
import {Operation} from "./ai/operations/Operation";
import {Mission} from "./ai/missions/Mission";
import {Agent} from "./ai/missions/Agent";
import {RoomHelper} from "./ai/RoomHelper";

export var sandBox = {
    run: function() {
        let claimerFlag = Game.flags["claimerFlag"];
        if (claimerFlag) {
            let claimer = Game.creeps["claimer"];
            if (!claimer) {
                empire.spawnFromClosest(claimer.pos, [CLAIM, MOVE], "claimer");
            }
            if (claimer.pos.inRangeTo(claimerFlag, 0)) {
                claimer.claimController(claimer.room.controller);
                console.log("### claimer waiting");
            }
            else {
                empire.traveler.travelTo(claimer, claimerFlag);
            }
        }

        let sandboxFlag = Game.flags["sandbox"];
        if (sandboxFlag) {
            let sandboxOp = new SandboxOperation(sandboxFlag, "sand0", "sandbox");
            sandboxOp.init();
        }

        if (!Memory.temp.ranTest) {
            Memory.temp.ranTest = true;
            let place1 = Game.flags["keeper_lima6"];
            let destinations = _.toArray(empire.spawnGroups);
            let selected = RoomHelper.findClosest(place1, destinations, {margin: 50});
            console.log(`selected the following: `);
            for (let value of selected) { console.log(value.destination.pos)}
        }

        if (Game.time % 10 === 0) {
            console.log("cpu: " + _.round(Memory.cpu.average, 2), "perCreep: " +
                _.round(Memory.cpu.average / Object.keys(Game.creeps).length, 2))
        }
    }
};

class SandboxOperation extends Operation {
    initOperation() {
        this.addMission(new SandboxMission(this, "sandbox"));
    }

    finalizeOperation() {
    }

    invalidateOperationCache() {
    }

}

class SandboxMission extends Mission {
    initMission() {
    }

    roleCall() {
    }

    missionActions() {
        let leaderCreep = Game.creeps["leader"];
        let leader;
        if (leaderCreep) {
            leader = new Agent(leaderCreep, this);
        } else {
            empire.spawnFromClosest(this.flag.pos, [MOVE], "leader");
        }

        let followerCreep = Game.creeps["follower"];
        let follower;
        if (followerCreep) {
            follower = new Agent(followerCreep, this);
        } else {
            empire.spawnFromClosest(this.flag.pos, [MOVE], "follower");
        }

        if (!leader || !follower) { return; }

        Agent.squadTravel(leader, follower, this.flag);
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

}