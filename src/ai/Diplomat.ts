export class Diplomat {

    public allies: {[username: string]: boolean};
    public foes: {[username: string]: boolean};
    public partners: {[username: string]: boolean};

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

    public checkEnemy(username: string, roomName: string) {
        if ( this.allies[username] ) {
            return false;
        }

        // make note of non-ally, non-npc creeps
        if (username !== "Invader" && username !== "Source Keeper") {
            Diplomat.strangerDanger(username, roomName);
        }
        return true;
    }

    public static strangerDanger(username: string, roomName: string) {
        if (!Memory.strangerDanger) { Memory.strangerDanger = {}; }
        if (!Memory.strangerDanger[username]) { Memory.strangerDanger[username] = []; }
        let lastReport = _.last(Memory.strangerDanger[username]) as StrangerReport;
        if (!lastReport || lastReport.tickSeen < Game.time - 2000 ) {
            let report = { tickSeen: Game.time, roomName: roomName };
            console.log("STRANGER DANGER: one of", username, "\'s creeps seen in", roomName);
            Memory.strangerDanger[username].push(report);
            while (Memory.strangerDanger[username].length > 10) { Memory.strangerDanger[username].shift(); }
        }
    }

}

export const ALLIES = {
    "taiga": true,
    "Reini": true,
    "bonzaiferroni": true,
    "SteeleR": true,
    "Vervorris": true,
    "Jeb": true,
    "danny": true,
    "Atavus": true,
    "Ashburnie": true,
    "ricane": true,
    "trebbettes": true,
    "bovius": true,
};

export const TRADE_PARTNERS = {
    "bonzaiferroni": true,
    "taiga": true,
    "Reini": true,
    "Vervorris": true,
    "Jeb": true,
    "trebbettes": true,
    "ricane": true,
};

export const FOES = {

};
