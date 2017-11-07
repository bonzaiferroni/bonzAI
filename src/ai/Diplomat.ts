import {Notifier} from "../notifier";
export class Diplomat {

    public allies: {[username: string]: boolean};
    public foes: {[username: string]: boolean};
    public partners: {[username: string]: boolean};
    public safe: {[username: string]: boolean};
    public danger: {[username: string]: boolean};

    constructor() {
        if (!Memory.empire) { Memory.empire = {}; }
        _.defaults(Memory.empire, {
            allies: ALLIES,
            foes: FOES,
            partners: TRADE_PARTNERS,
            safe: {},
            danger: {},
        });
        this.allies = Memory.empire.allies;
        this.foes = Memory.empire.foes;
        this.partners = Memory.empire.partners;
    }

    public update() {
        this.allies = Memory.empire.allies;
        this.foes = Memory.empire.foes;
        this.partners = Memory.empire.partners;
    }

    public checkEnemy(creep: Creep) {
        if (this.allies[creep.owner.username]) {
            return false;
        }

        // make note of non-ally, non-npc creeps
        if (creep.owner.username !== "Invader" && creep.owner.username !== "Source Keeper") {
            Diplomat.strangerDanger(creep);
        }

        return true;
    }

    public static strangerDanger(creep: Creep) {
        let controller = creep.room.controller;
        let username = creep.owner.username;
        if (controller && controller.owner && controller.owner.username === username) { return; }
        if (!Memory.strangerDanger) { Memory.strangerDanger = {}; }
        if (!Memory.strangerDanger[username]) { Memory.strangerDanger[username] = []; }
        if (Memory.strangerDanger[username]["ignore"]) { return; }

        let lastReport = _.last(Memory.strangerDanger[username]) as StrangerReport;
        if (!lastReport || lastReport.tickSeen < Game.time - 100 ) {
            let report = { tickSeen: Game.time, roomName: creep.pos.roomName };
            Notifier.log(`STRANGER DANGER: one of ${username} 's creeps seen in ${creep.pos.roomName}`, 2);
            let boostedPart = _.find(creep.body, x => x.boost);
            if (boostedPart) {
                Notifier.log(`${username}'s creep boosted with ${boostedPart.type}`, 3);
            }
            Memory.strangerDanger[username].push(report);
            while (Memory.strangerDanger[username].length > 10) { Memory.strangerDanger[username].shift(); }
        }
    }

}

export const ALLIES = {
};

export const TRADE_PARTNERS = {
};

export const FOES = {
};
