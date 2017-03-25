import {empire} from "./helpers/loopHelper";
import {Operation} from "./ai/operations/Operation";
import {Mission} from "./ai/missions/Mission";
import {Agent} from "./ai/missions/Agent";
import {RoomHelper} from "./ai/RoomHelper";
import {notifier} from "./notifier";

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
            } else {
                empire.traveler.travelTo(claimer, claimerFlag);
            }
        }

        let sandboxFlag = Game.flags["sandbox"];
        if (sandboxFlag) {
            let sandboxOp = new SandboxOperation(sandboxFlag, "sand0", "sandbox");
            global.sand0 = sandboxOp;
            sandboxOp.init();
            sandboxOp.roleCall();
            sandboxOp.actions();
            sandboxOp.finalize();
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

        // bucketTest();
    },
};

function bucketTest() {
    let cpu = Game.cpu.getUsed();
    let iterations = 0;
    let obj = {};
    while (Game.cpu.bucket >= 10000 && cpu < 260) {
        _.defaults(obj, {total: 0, count: 0, endOfPeriod: Game.time + 5, highest: 0});
        let nextCpu =  Game.cpu.getUsed();
        let delta = nextCpu - cpu;
        if (delta > 30) {
            notifier.log(`cpu delta: ${delta}, iterations: ${iterations}`);
        }
        cpu = nextCpu;
        iterations++;
    }
}

class SandboxOperation extends Operation {
    public initOperation() {
        this.addMission(new SandboxMission(this, "sandbox"));
    }

    public finalizeOperation() {
    }

    public invalidateOperationCache() {
    }

}

class SandboxMission extends Mission {
    public initMission() {
    }

    public roleCall() {
    }

    public missionActions() {
        // this.squadTravelTest();
        // this.fleeByPathTest();
        this.fatigueTest();
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    public squadTravelTest() {
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

    private fleeByPathTest() {
        let fleeFlag = Game.flags["fleeFlag"];
        if (!fleeFlag) { return; }

        let fleeCreep = Game.creeps["fleeCreep"];
        if (!fleeCreep) {
            empire.spawnFromClosest(fleeFlag.pos, [MOVE], "fleeCreep");
            return;
        }

        let agent = new Agent(fleeCreep, this);
        fleeFlag["id"] = "scaryGuy";
        let fleeing = agent.fleeByPath([fleeFlag as any], 6, 3);
        if (!fleeing) {
            agent.travelTo(fleeFlag);
        }
    }

    private fatigueTest() {
        let fattyCreep = Game.creeps["fatty"];
        if (!fattyCreep) {
            empire.spawnFromClosest(this.flag.pos, [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE],
                "fatty");
            return;
        }
        let fatty = new Agent(fattyCreep, this);
        fatty.travelTo(this.flag);
    }
}
