import {BonzAI} from "./BonzAI";

BonzAI.init();

// report cpu
console.log(`Global Refresh CPU: ${Game.cpu.getUsed()}`);

module.exports.loop = function () {

    BonzAI.init();
    BonzAI.update();
    BonzAI.roleCall();
    BonzAI.actions();
    BonzAI.finalize();
    BonzAI.postOperations();
};
