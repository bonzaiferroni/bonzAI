import {SpawnGroup} from "./SpawnGroup";
import {notifier} from "../notifier";
import {Profiler} from "../Profiler";
import {Traveler, traveler} from "./Traveler";
import {WorldMap} from "./WorldMap";
import {MarketTrader} from "./MarketTrader";
import {BonzaiDiplomat} from "./BonzaiDiplomat";
import {BonzaiNetwork} from "./BonzaiNetwork";

export class Empire {

    spawnGroups: {[roomName: string]: SpawnGroup} = {};
    memory: {
        errantConstructionRooms: {};
    };

    public traveler: Traveler;
    public diplomat: BonzaiDiplomat;
    public map: WorldMap;
    public network: BonzaiNetwork;
    public market: MarketTrader;

    constructor() {
        if (!Memory.empire) Memory.empire = {};
        _.defaults(Memory.empire, {
            errantConstructionRooms: {},
        });
        this.memory = Memory.empire;
    }

    /**
     * Occurs before operation phases
     */

    init() {
        this.traveler = traveler;
        this.diplomat = new BonzaiDiplomat();
        this.map = new WorldMap(this.diplomat);
        this.map.init();
        this.network = new BonzaiNetwork(this.map, this.diplomat);
        this.network.init();
        this.market = new MarketTrader(this.network);
    }

    /**
     * Occurs after operation phases
     */

    actions() {
        this.map.actions();
        this.network.actions();
        this.market.actions();
        this.clearErrantConstruction();
    }

    getSpawnGroup(roomName: string) {
        if (this.spawnGroups[roomName]) {
            return this.spawnGroups[roomName];
        }
        else {
            let room = Game.rooms[roomName];
            if (room && room.find(FIND_MY_SPAWNS).length > 0) {
                this.spawnGroups[roomName] = new SpawnGroup(room);
                return this.spawnGroups[roomName];
            }
        }
    }

    underCPULimit() {
        return Profiler.proportionUsed() < .9;
    }

    private clearErrantConstruction() {
        if (Game.time % 1000 !== 0) { return; }

        let removeErrantStatus = {};
        let addErrantStatus = {};
        for (let siteName in Game.constructionSites) {
            let site = Game.constructionSites[siteName];
            if (site.room) {
                delete this.memory.errantConstructionRooms[site.pos.roomName];
            }
            else {
                if (this.memory.errantConstructionRooms[site.pos.roomName]) {
                    site.remove();
                    removeErrantStatus[site.pos.roomName];
                }
                else {
                    addErrantStatus[site.pos.roomName] = true;
                }
            }
        }

        for (let roomName in addErrantStatus) {
            this.memory.errantConstructionRooms[roomName] = true;
        }

        for (let roomName in removeErrantStatus) {
            notifier.log(`EMPIRE: removed construction sites in ${roomName}`);
            delete this.memory.errantConstructionRooms[roomName];
        }
    }
}

