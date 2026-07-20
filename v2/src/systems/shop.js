const { SHOP_INVENTORY } = require('../data/items');
const { describeItem } = require('./itemGenerator');
const { colors } = require('../ui/io');

function runShop(io, player) {
  while (true) {
    io.clear();
    io.print(colors.green(`Welcome to the shop! You have ${player.gold} gold.\n`));
    io.print('1: Buy\n2: Sell\n3: Leave');
    const choice = io.ask('\n');

    if (choice === '1') {
      io.clear();
      const names = Object.keys(SHOP_INVENTORY);
      names.forEach((name, i) => {
        const { price, description } = SHOP_INVENTORY[name];
        io.print(`${i + 1}: ${name} - ${price}g (${description})`);
      });
      const pick = parseInt(io.ask('\nBuy which item? (number, 0 to cancel)\n'), 10);
      const name = names[pick - 1];
      if (!name) continue;
      const amountRaw = parseInt(io.ask(`How many ${name}?\n`), 10);
      const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : 0;
      const cost = SHOP_INVENTORY[name].price * amount;
      if (!player.spendGold(cost)) {
        io.print(colors.red("You can't afford that."));
        io.ask('(press enter to continue)');
        continue;
      }
      for (let i = 0; i < amount; i++) player.addConsumable(name);
      io.print(colors.green(`Bought ${amount} ${name} for ${cost}g.`));
      io.ask('(press enter to continue)');
    } else if (choice === '2') {
      io.clear();
      const sellables = [
        ...player.inventory.map((name) => ({ kind: 'consumable', name, sellValue: Math.max(1, Math.floor((SHOP_INVENTORY[name]?.price || 2) / 2)) })),
        ...player.items.map((item) => ({ kind: 'item', item, sellValue: Math.max(1, Math.floor(item.value / 2)) })),
      ];
      if (sellables.length === 0) {
        io.print(colors.yellow('You have nothing to sell.'));
        io.ask('(press enter to continue)');
        continue;
      }
      sellables.forEach((entry, i) => {
        const label = entry.kind === 'consumable' ? entry.name : describeItem(entry.item);
        io.print(`${i + 1}: ${label} - sells for ${entry.sellValue}g`);
      });
      const pick = parseInt(io.ask('\nSell which? (number, 0 to cancel)\n'), 10);
      const entry = sellables[pick - 1];
      if (!entry) continue;
      if (entry.kind === 'consumable') player.removeConsumable(entry.name);
      else player.items.splice(player.items.indexOf(entry.item), 1);
      player.addGold(entry.sellValue);
      io.print(colors.green(`Sold for ${entry.sellValue}g.`));
      io.ask('(press enter to continue)');
    } else {
      return;
    }
  }
}

module.exports = { runShop };
