import {Mission} from "./Mission";
import {Agent} from "./Agent";
import {Scheduler} from "../../Scheduler";
export class LinkNetworkMission extends Mission {

    private conduits: Agent[];

    private storageLinks: StructureLink[] = [];
    private sourceLinks: StructureLink[] = [];
    private controllerLink: StructureLink;

    public memory: {
        storageLinkIds: string[];
        linkFiringIndex: number;
    };

    /**
     * Manages linknetwork in room to efficiently send energy between the storage, controller, and sources
     * Assumptions: 1) all links within 1 linear distance of storage to be used as StorageLinks, 2) all links within
     * linear distance of 2 of sources to be used as sourceLinks, 3) all links within linearDistance of 3 of controller
     * to be used as controller links
     * @param operation
     */
    constructor(operation) {
        super(operation, "linkNetwork");
    }

    public initMission() {
        if (this.room.storage) {
            let controllerBattery = this.room.controller.getBattery();
            if (controllerBattery instanceof StructureLink) {
                this.controllerLink = controllerBattery;
            }
            this.findStorageLinks();
            if (this.room.controller.level === 8) {
                this.findSourceLinks();
            }
        }
    }

    public roleCall() {
        let conduitBody = () => {
            return this.workerBody(0, 8, 4);
        };
        let max = () => this.storageLinks.length > 0 && this.controllerLink ? 1 : 0;
        let memory = { scavanger: RESOURCE_ENERGY };
        this.conduits = this.headCount("conduit", conduitBody, max, {prespawn: 10, memory: memory });
    }

    public missionActions() {
        for (let conduit of this.conduits) {
            this.conduitActions(conduit);
        }

        if (this.room.controller.level < 8) {
            this.linkNetworkAlpha();
        } else {
            this.linkNetworkBeta();
        }
    }

    public finalizeMission() {
    }
    public invalidateMissionCache() {
    }

    private findStorageLinks() {
        if (this.room.controller.level === 8) {
            let storageLink = this.room.storage.findMemoStructure(STRUCTURE_LINK, 2) as StructureLink;
            if (storageLink) {
                this.storageLinks.push(storageLink);
            }
        } else {
            if (!Scheduler.delay(this.memory, "findStorageLinks", 100) || !this.memory.storageLinkIds) {
                let linkIds = [];
                let links = this.room.findStructures(STRUCTURE_LINK) as StructureLink[];
                for (let link of links) {
                    if (link.pos.inRangeTo(this.room.storage, 2)) {
                        this.storageLinks.push(link);
                        linkIds.push(link.id);
                    }
                }
                this.memory.storageLinkIds = linkIds;
            } else {
                for (let id of this.memory.storageLinkIds) {
                    let link = Game.getObjectById(id) as StructureLink;
                    if (link) {
                        this.storageLinks.push(link);
                    } else {
                        this.memory.storageLinkIds = _.pull(this.memory.storageLinkIds, id);
                    }
                }
            }

            this.storageLinks = _.sortBy(this.storageLinks, "energy");
        }
    }

    private findSourceLinks() {
        for (let source of this.sources) {
            let link = source.findMemoStructure(STRUCTURE_LINK, 2) as Link;
            if (link) {
                this.sourceLinks.push(link);
            }
        }
    }

    private conduitActions(conduit: Agent) {
        if (!conduit.memory.inPosition) {
            this.moveToPosition(conduit);
            return;
        }

        // in position
        if (this.room.controller.level < 8) {
            this.conduitAlphaActions(conduit);
        } else {
            this.conduitBetaActions(conduit);
        }
    }

    private moveToPosition(conduit: Agent) {
        for (let i = 1; i <= 8; i++) {
            let position = this.room.storage.pos.getPositionAtDirection(i);
            let invalid = false;
            for (let link of this.storageLinks) {
                if (!link.pos.isNearTo(position)) {
                    invalid = true;
                    break;
                }
            }
            if (invalid) { continue; }

            if (conduit.pos.inRangeTo(position, 0)) {
                conduit.memory.inPosition = true;
            } else {
                conduit.moveItOrLoseIt(position, "conduit");
            }
            return; // early
        }
        console.log("couldn't find valid position for", conduit.name);
    }

    private conduitAlphaActions(conduit: Agent) {
        if (conduit.carry.energy < conduit.carryCapacity) {
            conduit.withdraw(this.room.storage, RESOURCE_ENERGY);
        } else {
            for (let link of this.storageLinks) {
                if (link.energy < link.energyCapacity) {
                    conduit.transfer(link, RESOURCE_ENERGY);
                    break;
                }
            }
        }
    }

    private conduitBetaActions(conduit: Agent) {
        if (this.storageLinks.length === 0) { return; }

        let link = this.storageLinks[0];
        if (conduit.carry.energy > 0) {
            if (link.energy < 400) {
                conduit.transfer(link, RESOURCE_ENERGY, Math.min(400 - link.energy, conduit.carry.energy));
            } else {
                conduit.transfer(this.room.storage, RESOURCE_ENERGY);
            }
        }

        if (link.energy > 400) {
            conduit.withdraw(link, RESOURCE_ENERGY, link.energy - 400);
        } else if (link.energy < 400) {
            conduit.withdraw(this.room.storage, RESOURCE_ENERGY, 400 - link.energy);
        }
    }

    private linkNetworkAlpha() {
        if (!this.controllerLink) { return; }

        let longestDistance = this.findLongestDistance(this.controllerLink, this.storageLinks);

        if (Game.time % (Math.ceil(longestDistance / this.storageLinks.length)) === 0) {

            // figure out which one needs to fire
            if (this.memory.linkFiringIndex === undefined) {
                this.memory.linkFiringIndex = 0;
            }

            let linkToFire = this.storageLinks[this.memory.linkFiringIndex];
            if (linkToFire) {
                linkToFire.transferEnergy(this.controllerLink);
            } else {
                console.log("should never see this message related to alternating link firing");
            }

            this.memory.linkFiringIndex++;
            if (this.memory.linkFiringIndex >= this.storageLinks.length) {
                this.memory.linkFiringIndex = 0;
            }
        }
    }

    private linkNetworkBeta() {
        let firstLink = this.sourceLinks[0];
        let storageLink = this.storageLinks[0];
        if (!storageLink || !this.controllerLink) { return; }
        if (!firstLink) {
            if (storageLink && storageLink.cooldown === 0 && this.controllerLink) {
                // maintain controller while sourceLinks are not yet built
                storageLink.transferEnergy(this.controllerLink);
            }
            return;
        }

        if (Game.time % 40 === 0) {
            if (this.controllerLink.energy < 400) {
                firstLink.transferEnergy(this.controllerLink);
            } else {
                firstLink.transferEnergy(storageLink);
            }
        }
        if (Game.time % 40 === 20 && this.controllerLink.energy < 400) {
            storageLink.transferEnergy(this.controllerLink, 400 - this.controllerLink.energy);
        }

        if (this.sources.length === 1) { return; }
        let secondLink = this.sourceLinks[1];
        if (Game.time % 40 === 10 && secondLink && storageLink) {
            secondLink.transferEnergy(storageLink);
        }
    }

    private findLongestDistance(origin: RoomObject, objects: RoomObject[]): number {
        let distance = 0;
        for (let object of objects) {
            let dist = origin.pos.getRangeTo(object);
            if (dist > distance) {
                distance = dist;
            }
        }
        return distance;
    }
}
