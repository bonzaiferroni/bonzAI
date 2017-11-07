import {SandboxMission, SandboxOperation} from "../ai/operations/SandboxOperation";
import {Agent} from "../ai/agents/Agent";
import {MiningOperation} from "../ai/operations/MiningOperation";

export const testCPU = {

    agentInstantiation(count = 1) {
        let flagName = "opType_opName";
        let flag = Game.flags[flagName];
        let opType = flagName.substring(0, flagName.indexOf("_"));
        let opName = flagName.substring(flagName.indexOf("_") + 1);
        let sandbox = new SandboxOperation(flag, opName, opType);
        let mission = new SandboxMission(sandbox);
        let creep = _.last(_.toArray(Game.creeps));

        let test1 = () => {
            let agent = new Agent(creep, mission);
            agent.pos = creep.pos;
            agent.room = creep.room;
            agent.memory = creep.memory;
        };

        let agent = new Agent(creep, mission);
        let test2 = () => {
            agent.pos = creep.pos;
            agent.room = creep.room;
            agent.memory = creep.memory;
        };

        let tests = [test1, test2];
        if (Math.random() < .5) {
            tests = [test2, test1];
        }

        for (let test of tests) {
            let sum = 0;
            for (let i = 0; i < count; i++) {
                let cpu = Game.cpu.getUsed();
                test();
                cpu = Game.cpu.getUsed() - cpu;
                sum += cpu;
            }
            console.log(`${test.name} ${_.round(sum, 5)}`);
        }

        // conclusion: test1 was about 3x as expensive
        // n = 1000, test1 = 1.5, test2 = .6
    },

    operationInstantiation(count = 1) {
        let flagName = "opType_opName";
        let test1 = () => {
            let flag = Game.flags[flagName];
            let opType = flagName.substring(0, flagName.indexOf("_"));
            let opName = flagName.substring(flagName.indexOf("_") + 1);
            let miningOperation = new MiningOperation(flag, opName, opType);
            miningOperation.flag = flag;
            miningOperation.room = flag.room;
            miningOperation.memory = flag.memory;
        };

        let flag = Game.flags[flagName];
        let opType = flagName.substring(0, flagName.indexOf("_"));
        let opName = flagName.substring(flagName.indexOf("_") + 1);
        let miningOperation = new MiningOperation(flag, opName, opType);
        let test2 = () => {
            miningOperation.flag = flag;
            miningOperation.room = flag.room;
            miningOperation.memory = flag.memory;
        };

        let tests = [test1, test2];
        if (Math.random() < .5) {
            tests = [test2, test1];
        }

        for (let test of tests) {
            let sum = 0;
            for (let i = 0; i < count; i++) {
                let cpu = Game.cpu.getUsed();
                test();
                cpu = Game.cpu.getUsed() - cpu;
                sum += cpu;
            }
            console.log(`${test.name} ${_.round(sum, 5)}`);
        }

        // conclusion: test1 was about twice as expensive
        // n = 1000, test1 = 2.5, test2 = 1
    },
};
