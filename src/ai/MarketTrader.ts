import {MINERALS_RAW, RESERVE_AMOUNT, TradeNetwork, PRODUCT_LIST} from "./TradeNetwork";
import {Notifier} from "../notifier";
export class MarketTrader {

    private network: TradeNetwork;
    public prices: {
        [orderType: string]: {
            [resourceType: string]: number
        }
    };

    /* hardcoded values based on the state of the market when this was written, used as default values for prices
    for best results, write a script that will update prices based on the current state of the market */
    private resourceValues = {
        energy: .012,
        H: .2,
        O: .2,
        Z: .15,
        K: .15,
        U: .15,
        L: .15,
        X: .15,
        XUH2O: 1.5,
        XLHO2: 1.5,
        XKHO2: 1.5,
        XZHO2: 1.5,
        XZH2O: 1.5,
        XLH2O: 1.5,
        XGH2O: 2,
        XGHO2: 2,
        G: 1,
    };
    private blacklist: { [roomName: string]: boolean };

    constructor(network: TradeNetwork) {
        this.network = network;
    }

    public update() {
        if (!Memory.marketTrader.prices) {
            Memory.marketTrader.prices = {
                [ORDER_BUY]: {},
                [ORDER_SELL]: {},
            };
        }
        this.prices = Memory.marketTrader.prices;
    }

    public updateBlacklist(blacklist: {[roomName: string]: boolean}) {
        this.blacklist = blacklist;
    }

    public actions() {
        this.buyShortages();
        // this.sellCompounds();
    }

    public getPrice(resourceType: string, orderType: string) {
        let price = this.resourceValues[resourceType];
        if (this.prices[orderType][resourceType]) {
            price = this.prices[orderType][resourceType];
        }
        return price;
    }

    public setPrice(resourceType: string, orderType: string, price: number) {

        // sanity check
        let currentPrice = this.getPrice(resourceType, orderType);
        if (price < currentPrice * .1 || price > currentPrice * 10) {
            Notifier.log(`TRADER: ${orderType} price for ${resourceType} failed sanity check. current price: ${
                currentPrice}, failed price: ${price}`);
            return;
        }

        this.prices[orderType][resourceType] = _.round(price, 3);
    }

    public displayPrices() {
        console.log(JSON.stringify(this.prices, null, 4));
    }

    public buyShortages() {
        if (Game.market.credits < Memory.playerConfig.creditReserveAmount) { return; } // early

        // OK - can only happen once per tick
        if (Game.time % 100 !== 2) { return; }

        // you could use a different constant here if you wanted to limit buying
        for (let mineralType of MINERALS_RAW) {

            let abundance = this.network.hasAbundance(mineralType, RESERVE_AMOUNT);
            if (!abundance) {
                console.log("EMPIRE: theres not enough", mineralType + ", attempting to purchase more");
                let terminal = this.findBestTerminal(mineralType);
                if (terminal) {
                    this.buyMineral(terminal.room, mineralType);
                }
            }
        }
    }

    private buyMineral(room: Room, resourceType: string) {
        if (room.terminal.store[resourceType] > TERMINAL_CAPACITY - RESERVE_AMOUNT) {
            console.log("EMPIRE: wanted to buy mineral but lowest terminal was full, check " + room.name);
            return;
        }

        this.removeOrders(ORDER_SELL, resourceType);
        let orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: resourceType});

        let bestOrder: Order;
        let lowestExpense = Number.MAX_VALUE;
        for (let order of orders) {
            if (order.remainingAmount < 100) { continue; }
            let expense = order.price;
            let transferCost = Game.market.calcTransactionCost(100, room.name, order.roomName) / 100;
            expense += transferCost * this.getPrice(RESOURCE_ENERGY, ORDER_BUY);
            if (expense < lowestExpense) {
                lowestExpense = expense;
                bestOrder = order;
                console.log("I could buy from", order.roomName, "for", order.price, "(+" + transferCost + ")");
            }
        }

        if (bestOrder) {
            let amount = Math.min(bestOrder.remainingAmount, RESERVE_AMOUNT);

            // TODO: disqualify deal when energy costs of transfer are unacceptable relative to resource value

            let outcome = Game.market.deal(bestOrder.id, amount, room.name);
            console.log("bought", amount, resourceType, "from", bestOrder.roomName, "outcome:", outcome);

            let noBuyOrders = this.orderCount(ORDER_BUY, resourceType) === 0;
            if (noBuyOrders) {
                Game.market.createOrder(ORDER_BUY, resourceType, bestOrder.price, RESERVE_AMOUNT * 2, room.name);
                console.log("placed ORDER_BUY for", resourceType, "at", bestOrder.price, "Cr, to be sent to",
                    room.name);
            }

            /*
             if (outcome === OK) {
             console.log("bought", amount, resourceType, "from", bestOrder.roomName, "outcome:", outcome);
             if (!Memory.dealHistory) {
             Memory.dealHistory = [];
             }

             this.addDeal(bestOrder);
             }
             else {
             console.log("there was a problem trying to deal:", outcome);
             }
             */
        }
    }

    public sellCompounds() {
        // OK - can only happen once per tick
        if (Game.time % 100 !== 2) { return; }

        for (let compound of PRODUCT_LIST) {

            let price = this.resourceValues[compound];
            if (this.prices[ORDER_SELL][compound]) {
                price = this.prices[ORDER_SELL][compound];
            }

            if (this.orderCount(ORDER_SELL, compound, price) > 0) { continue; }

            let stockedTerminals = _.filter(this.network.terminals, t => t.store[compound] >= RESERVE_AMOUNT);
            if (stockedTerminals.length === 0) { continue; }
            console.log("MARKET: no orders for", compound, "found, creating one");
            let competitionRooms = _.map(Game.market.getAllOrders({type: ORDER_SELL, resourceType: compound}),
                (order: Order) => {
                return order.roomName;
            });

            let distanceToNearest = 0;
            let bestTerminal: StructureTerminal;
            for (let terminal of stockedTerminals) {
                let nearestCompetition = Number.MAX_VALUE;
                for (let roomName of competitionRooms) {
                    let distance = Game.map.getRoomLinearDistance(roomName, terminal.room.name);
                    if (distance < nearestCompetition) { nearestCompetition = distance; }
                }
                if (nearestCompetition > distanceToNearest) {
                    distanceToNearest = nearestCompetition;
                    bestTerminal = terminal;
                    console.log("I could sell from", terminal.room.name + ", nearest competition is",
                        nearestCompetition, "rooms away");
                }
            }

            Game.market.createOrder(ORDER_SELL, compound, price, RESERVE_AMOUNT,
                bestTerminal.room.name);
        }
    }

    public sellExcess(room: Room, resourceType: string, dealAmount: number) {
        let orders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: resourceType});

        this.removeOrders(ORDER_BUY, resourceType);

        let bestOrder: Order;
        let highestGain = 0;
        for (let order of orders) {
            if (order.remainingAmount < 100) { continue; }
            if (this.blacklist[order.roomName]) {
                Notifier.log(`skipped: ${order.roomName} due to blacklist`, 3);
                continue;
            }
            let gain = order.price;
            let transferCost = Game.market.calcTransactionCost(100, room.name, order.roomName) / 100;
            gain -= transferCost * this.getPrice(RESOURCE_ENERGY, ORDER_BUY);
            if (gain > highestGain) {
                highestGain = gain;
                bestOrder = order;
                console.log("I could sell it to", order.roomName, "for", order.price, "(+" + transferCost + ")");
            }
        }

        if (bestOrder) {
            let amount = Math.min(bestOrder.remainingAmount, dealAmount);
            let outcome = Game.market.deal(bestOrder.id, amount, room.name);

            let notYetSelling = this.orderCount(ORDER_SELL, resourceType, bestOrder.price) === 0;
            if (notYetSelling) {
                Game.market.createOrder(ORDER_SELL, resourceType, bestOrder.price, dealAmount * 2, room.name);
                console.log("placed ORDER_SELL for", resourceType, "at", bestOrder.price, "Cr, to be sent from",
                    room.name);
            }

            if (outcome === OK) {
                console.log("sold", amount, resourceType, "to", bestOrder.roomName, "outcome:", outcome);

            } else if (outcome === ERR_INVALID_ARGS) {
                console.log("invalid deal args:", bestOrder.id, amount, room.name);
            } else {
                console.log("there was a problem trying to deal:", outcome);
            }
        }
    }

    private removeOrders(type: string, resourceType: string) {
        for (let orderId in Game.market.orders) {
            let order = Game.market.orders[orderId];
            if (order.type === type && order.resourceType === resourceType) {
                Game.market.cancelOrder(orderId);
            }
        }
    }

    private orderCount(type: string, resourceType: string, adjustPrice?: number): number {
        let count = 0;
        for (let orderId in Game.market.orders) {
            let order = Game.market.orders[orderId];
            if (order.remainingAmount < 10 && order.resourceType !== "token") {
                Game.market.cancelOrder(orderId);
            } else if (order.type === type && order.resourceType === resourceType) {
                count++;
                /*if (adjustPrice && adjustPrice < order.price) {
                    console.log("MARKET: lowering price for", resourceType, type, "from", order.price, "to",
                        adjustPrice);
                    Game.market.changeOrderPrice(order.id, adjustPrice);
                }*/
            }
        }
        return count;
    }

    public findBestTerminal(resourceType: string, searchType = "lowest"): StructureTerminal {
        if (searchType === "lowest") {
            let lowest = Number.MAX_VALUE;
            let lowestTerminal: StructureTerminal;
            for (let terminal of this.network.terminals) {
                let amount = terminal.store[resourceType] || 0;
                if (amount < lowest) {
                    lowest = amount;
                    lowestTerminal = terminal;
                }
            }
            return lowestTerminal;
        } else {
            let highest = 0;
            let highestTerminal: StructureTerminal;
            for (let terminal of this.network.terminals) {
                let amount = terminal.store[resourceType] || 0;
                if (amount > highest) {
                    highest = amount;
                    highestTerminal = terminal;
                }
            }
            return highestTerminal;
        }
    }
}
