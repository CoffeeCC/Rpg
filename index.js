const colors = require('colors/safe');
const input = require("readline-sync");
 const functions = require('./Functions.js');
///Equipable items
 let Wooden_Staff = {
      Attack: 1,
      Magic: 5,
    };
  let Apprentice_Robes = {
    Defense: 1,
    Magic: 2,
  };
  //Monster Names
let MonsterNamesPRE = ["Gro","Zoo","Glo","Gru","Dro","Dre","Zar","Klo","Gre","Spoo","Tre","Glar","Zar","Kar","Tar","Tu","Har","Glee","tug","Bloo","Tal",];
let MonsterNamesSUF = ["Gro","Zoo","Glo","Gru","Dro","Dre","Zar","Klo","Gre","Spoo","Tre","Glar","Zar","Kar","Tar","Tu","Har","glee","tug","Bloo","Tal",];
//The HUD
function HUD() {

  console.log("--------------------------------------------------------------\nLocation:",Location,"Progress",Character1.Progress);
  console.log(" Name:",Character1.Name," Level:",Character1.Level,"EXP",Character1.EXP,"\n","Health:",Character1.HP,"\n","Race:",Character1.Race,"\n","Class:",Character1.Class,"\n--------------------------------------------------------------\n");
}
/////////////////////////////////////Instancing stuff
let Start =[""]
let ItemList = ["Green Herb","Red Herb","Yellow Herb",]
let Races = ["Human","Elf","Dwarf",""];
let Classes = ["Warrior", "Mage","Thief","Bard","Knight",]
let Location = ["Town"];
let P2 = false;
let P3 = false;

let Character1 = {
  Start: " ",
  Name:  " ",
  Race:  " ",
  Class:  " ",
  Level:  1,
  HP: 1,
  Strength: 1,
  Defense: 1,
  Dexterity: 1,
  Mana: 1,
  MgDef: 1,
  Intellect: 1,
  MaxHP: 100,
  Progress: 1,
  Search: 1,
  EXP: 0,
  Level: 1,
  AttributePoints: 0,
  IInv: ["Jerky",],
  EInv: [""],
};
let Character2 = {
  Start: " ",
  Name:  " ",
  Race:  " ",
  Class:  " ",
  Level:  1,
  HP: 1,
  Strength: 1,
  Defense: 1,
  Dexterity: 1,
  Mana: 1,
  MgDef: 1,
  Intellect: 1,
  MaxHP: 100,
  Progress: 1,
  Search: 1,
  EXP: 0,
  Level: 1,
  AttributePoints: 0,
  IInv: ["Jerky",],
  EInv: [""],
};
let Character3 = {
  Start: " ",
  Name:  " ",
  Race:  " ",
  Class:  " ",
  Level:  1,
  HP: 1,
  Strength: 1,
  Defense: 1,
  Dexterity: 1,
  Mana: 1,
  MgDef: 1,
  Intellect: 1,
  MaxHP: 100,
  Progress: 1,
  Search: 1,
  EXP: 0,
  Level: 1,
  AttributePoints: 0,
  IInv: ["Jerky",],
  EInv: [""],
};
let Monster1 = {
  Name:  " ",
  Race:  " ",
  Class:  " ",
  Level:  1,
  HP: 0,
  Strength: 1,
  Mana: 1,
  Intellect: 1,
  Agility: 1,
  Luck: 1,

  MaxHP: 100,
  Progress: 1,
  Search: 1,
};

CreateCharacter();
function CreateCharacter(){
Character1.Name = input.question(colors.green("Please enter your name... \n\n"));
//// Example import console.log(character2Test.HP);
console.clear();
  console.log(colors.green("Please Choose a Race\n"));
for (i = 0; i < Races.length; i++) {
  console.log(Races[i]);
}
Character1.Race = input.question("\n");
console.clear();
console.log(colors.green("Please Choose a Class\n"));
for (i = 0; i < Classes.length; i++) {
  console.log(Classes[i]);
}
Character1.Class = input.question("\n\n");
console.clear();
console.log(colors.yellow("______________________________________________________________\n"));
console.log("Name: ");
console.log(colors.blue(Character1.Name,"\n"));
console.log("Race: ");
console.log(colors.blue(Character1.Race,"\n"));
console.log("Class: ");
console.log(colors.blue(Character1.Class,"\n"));
console.log(colors.yellow("______________________________________________________________\n"));
Character1.Start = input.question(colors.green("Does everything look correct? Would you like to Begin? (Y/N)\n"));
if (Character1.Start == "Y") {
  console.clear();
  if(Character1.race = "Human") {
    Character1.Mana = 3;
    Character1.HP = 100;
    Character1.MP = 5;
    Character1.Strength = 3;
    Character1.Defense = 2;
    Character1.Luck = 3;
    Character1.Intellect = 3;
    Character1.Dexterity = 3;
    Character1.MaxHP = 100;
    };
    if(Character1.Class = "Mage") {
      Character1.Weapon = Wooden_Staff;
      Character1.Armor = Apprentice_Robes;
      Character1.Spells = (colors.red(" 1. Flare"))+(colors.yellow(" 2. Stun"))+(colors.blue(" 3. Spout"));
    }
};
if (Character1.Start == "N") {
  CreateCharacter();
};

HUD();
MOVING();
};


////////////////////////Function Storage/////////////
function EXPgain () {
Character1.EXP = Character1.EXP + Monster1.EXP;
if (Character1.EXP >= 10 && Character1.Level == 1) {
  Character1.Level++ 
  LevelUp()
};
function DeathCheck() {
  let DropChance
  if (Monster1.HP >= 0) {
console.log(Monster1.Name,"Was Defeated!");
  if (DropChance >= 5) {
    GenerateItem();
  }

  }
}

};
function LevelUp() {
Character1.Level++
Character1.AttributePoints = (Character1.AttributePoints + 6);
console.log(colors.yellow("Congratulations!, You've Leveled up!\n"));
console.log(Character1.Name," has gained 6 attribute points! Spend them wisely!");
MOVING();
};

function CombatHUD() {
  let HitChance = (Math.floor(Math.random() * 100)) + Character1.Dexterity;
  let MHitChance = (Math.floor(Math.random() * 100)) + Monster1.Dexterity;
  let DmgR = Math.floor(Math.random() * 3);
  let Dmg = 0;
  let MgDmg = 0;
  let BlkDmg = 0;
  let SpellEffectChance = Math.floor(Math.random() * 10);
  Critical = 0;
  let Burned = 5;
  let Normal = 0;
  let Stunned = 0;
  let PMHit = (Math.floor(Math.random() * 4));

  console.log(" ***************************************************************************")
    console.log(colors.blue(Character1.Name),"HP:",Character1.HP,"\n","MP:",Character1.MP,"\n","***************************************************************************\n");
    function PartyMembers() {
      console.log("****************************************************************************")
    console.log(colors.blue(Character2.Name),"Level:","HP:",Character2.HP,"\n****************************************************************************\n");
    console.log(colors.red("****************************************************************************"))
    console.log(colors.red(Monster1.Name,"HP",Monster1.MonsterHP,"Level:",Monster1.Level,"Wildness:",Monster1.Wild));
    console.log(colors.red("****************************************************************************"));
    }

    PartyMembers();
    switch ( Monster1.State ) {
      case "Normal":
      console.log(colors.green("\n"));
  break;
      case "Burned":
      console.log(colors.green(Monster1.Name,"Takes",Burned,"Damage due to its Burn!\n\n"));
    break;  
      case "Stunned":
      console.log(colors.green(Monster1.Name," is Paralyzed and cannot move!\n\n"));
      break;
    }
    if (Monster1.MonsterHP <= 0) {
      console.clear();
    console.log(colors.yellow(Monster1.Name, "Has been Defeated!\n"));
    console.log(colors.green (Character1.Name, "has gained", Monster1.EXP,"Experience!\n"));
    EXPgain();
    HUD();
    MOVING();
    }
  console.log(colors.yellow("______________________________________________________________\n"));
  console.log(colors.blue("1: Attack\n"));
  console.log(colors.blue("2: Defend\n"));
  console.log(colors.blue("3: Magic\n"));
  console.log(colors.blue("4: Tame\n"));
  console.log(colors.blue("5: Items\n"));
  console.log(colors.blue("6: DOC\n"));
  console.log(colors.yellow("______________________________________________________________\n"));
   CombatAction = input.question("Choose an Action...\n");
  console.clear();
   console.log("-----------------------------------------------------------------\n")
  switch(CombatAction) {
    case '1':
    if (HitChance >= 50) {
    console.log(colors.green(Character1.Name,"Attacked",Monster1.Name,"!"));
    Dmg = (Character1.Strength + Character1.Weapon.Attack + DmgR) - (Monster1.Defense);
    if (Dmg <= 0) {
      Dmg = 1
    }
    }
    else {
      console.log(colors.green(Character1.Name," Attacked and Missed"));
    }
    console.log(colors.green(Monster1.Name,"Suffered",Dmg,"Damage!\n"));
    Monster1.MonsterHP = (Monster1.MonsterHP - Dmg);
    console.log(colors.red(Monster1.Name,"Attacked!"));
    if (MHitChance >= 50) {
      Dmg = (Monster1.Attack + DmgR) - (Character1.Defense) + Monster1.Level;
    }
    if (PMHit = 1) {
      Character1.HP = (Character1.HP - Dmg);
      console.log(colors.red(Character1.Name, "Suffered", Dmg,"Damage!\n"))
    }
    if (PMHit == 2 & P2 == true) {
      Character2.HP = (Character2.HP - Dmg);
      console.log(colors.red(Character2.Name, "Suffered", Dmg,"Damage!\n"))
    }
    if (PMHit == 3 && P3 == true) {
      Character3.Hp = (Character3.HP - Dmg);
      console.log(colors.red(Character3.Name, "Suffered", Dmg,"Damage!\n"))
    }
    if (PMHit == 0) {
      console.log(colors.red(Monster1.Name, "Missed its target!"));
    }
    
    console.log(PMHit);
    CombatHUD();
    case '2':
    console.log(colors.green(Character1.Name,"Braced for impact","!"));
    BlkDmg = (Monster1.Attack - (Character1.Defense + Character1.Armor.Defense));
    console.log(colors.green(Monster1.Name,"Attacked",Character1.Name,"!"));
    console.log(colors.green(Character1.Name," Blocked",Monster1.Name,"'s attack!"));
    console.log(colors.green(Character1.Name," suffered",BlkDmg,"Damage"));
    Character1.HP = (Character1.HP - BlkDmg);
    CombatHUD();
    
    case '3':
    let Spells = Character1.Spells
    console.log(Spells);
    console.log("\n");
    SpellChoice = input.question("Choose a Spell...\n");
    if (SpellChoice == 1 && Character1.Class == "Mage") {
console.log("\n",colors.green(Character1.Name,"Cast",(colors.red("Flare!")),"at ",Monster1.Name,"!"));
MgDmg = (5 + Character1.Weapon.Magic + Character1.Armor.Magic + DmgR);
console.log(colors.green(Monster1.Name,"Suffered",MgDmg,"Damage!\n"))
Monster1.MonsterHP = (Monster1.MonsterHP - MgDmg);
if (SpellEffectChance >= 7 ) {
  console.log(colors.green(Monster1.Name,"Was Burned!"));
  Monster1.State = "Burned";
};
CombatHUD();
    }
  if (SpellChoice == 2 && Character1.Class == "Mage") {
console.log("\n",colors.green(Character1.Name,"Cast",(colors.yellow("Stun!")),"at ",Monster1.Name,"!"));
MgDmg = (1 + Character1.Weapon.Magic + Character1.Armor.Magic + DmgR);
console.log(colors.green(Monster1.Name,"Suffered",MgDmg,"Damage!\n"))
Monster1.MonsterHP = (Monster1.MonsterHP - MgDmg);
if (SpellEffectChance >= 8 ) {
  console.log(colors.green(Monster1.Name,"Was Stunned!"));
  Monster1.State = "Stunned";
};
CombatHUD();
  }
    case '4':
    console.clear();
    console.log(colors.green("You attempt to tame the monster...\n"));
    input.question(colors.green("..."));
    if (Monster1.Wild <= 33) {

      console.log(colors.green(Monster1.Name," was succesfully Tamed!"));
      console.log(colors.green("You May Choose a Name, and inspect your monster in the monster Menu."))
      P2 = !P2;
      Character2.Name = Monster1.Name;
      Character2.HP = Monster1.MaxHP;
      Character2.Strength = Monster1.Attack;
      Character2.Dexterity = Monster1.Dexterity;
      Character2.Defense = Monster1.Defense;
      Character2.MgDef = Monster1.MgDef;
      Character2.Level = Monster1.Level;
      Character2.EXP = 0;


      HUD();
      MOVING();
      
    }
    if (Monster1.Wild >= 100) {
      console.log(Monster1.Name," Is to Wild To Tame!");
      CombatHUD();
    }
    
    case '5':  
    console.clear();
   console.log (Object.entries(Character1.Inv));
   ItemChoice = input.question("Choose a Bait to use\n");
switch(ItemChoice) {
  case 'Jerky':
  console.log(ItemChoice,"Was offered to, ",Monster1.Name);
  Monster1.Wild = (Monster1.Wild * .75) - 5;
  console.log(Monster1.Name,"'s Wild Nature was reduced.\n");
CombatHUD();
}
}
  };
function CreateMonster() {
let R = Math.floor(Math.random() * 3);
Monster1.State = "Normal",
Monster1.EXP = Math.floor((Math.random() * 5) * (Monster1.Level) + 1),
Monster1.Attack = Math.floor(Math.random() * 3) + Monster1.Level,
Monster1.Dexterity = Math.floor(Math.random() * 3) + Monster1.Level,
Monster1.Defense = Math.floor(Math.random() * 3) + Monster1.Level,
Monster1.MgDef = Math.floor(Math.random() * 2) + Monster1.Level
Monster1.MonsterHP = Math.floor(Math.random() * 30) + Character1.Level,
Monster1.MaxHP = Monster1.MonsterHP,
Monster1.Level = (Math.floor(Math.random()* 5)) + Character1.Level,
Monster1.MonsterXP = (Monster1.MonsterHP/2),
Monster1.Wild = 100,
Monster1.Name = MonsterNamesPRE[Math.floor(Math.random()*MonsterNamesPRE.length)] + "-" + MonsterNamesSUF[Math.floor(Math.random()*MonsterNamesSUF.length)]
if (Monster1.MonsterHP <= 10) {
  CreateMonster();
};
if (Monster1.MonsterLevel == 0) {
  CreateMonster();
};
};
function MOVING(){
  let EncounterChance = Math.floor(Math.random() * 10) + 1;
  let ItemChance = Math.floor (Math.random() * 10) + 1;
  let Choice;
  console.log(colors.yellow("______________________________________________________________\n"));
  console.log("1. Move Forwards.\n");
  console.log("2. Rest.\n");
  console.log("3. Use Shop(This will be Deprecated).\n");
  console.log("4. Search\n");
  console.log("5. Character\n");
  console.log("6. Equipment\n");
  console.log("7. Party(Not added yet.)\n");
  console.log("EncounterChance",EncounterChance,"ItemChance",ItemChance);
Choice = input.question(colors.yellow("______________________________________________________________\n"));
///Maybe use a switch for this?
switch (Choice) {
 case '1':
Character1.Progress++
Character1.Search++
if (EncounterChance >= 5) {
 

  console.clear();
  CreateMonster();
  CombatHUD();
}
else {
  HUD();
  MOVING();
}
  case '2': 
    //Rest and Gain Health,Day Progresses.
  
  case '3':
Character1.Progress--
Shop();

  case '4':
    if (Character1.Search >= 1) {
      console.clear()
    console.log(colors.green("You Search the Area for Anything Useful\n"));
    if (ItemChance > 6) {
      console.log("You found a",ItemList[Math.floor(Math.random()*ItemList.length)]);
      console.log("\n\n\n");
    }
    else {
      console.log(colors.green("You Failed to find anything noteworthy"));
    }
    Character1.Search--
    MOVING();
    }
    else if (Character1.Search < 1) {
      console.log("You have Already Searched this area.\n.");
      MOVING();
    }
    if (Character1.Progress = 2) {
  ///Run Event for Second Space
    }
    else  {
      console.log("You dont see anything Interesting\n");
      
      MOVING();
    };

  case '5':
  function PrintCharSheet() {

    console.clear();
    if (Character1.AttributePoints > 0) {

  console.log(colors.yellow("______________________________________________________________\n"));
  console.log("Attribute Points remaining: ",Character1.AttributePoints,"\n\n");
  console.log("To spend your remaining Attribute Points, type the Attribute you wish to increase, followed by the amount of points you wish to allocate. ( example:  STR. Followed by 2.)\n\n");

  console.log("Character Stats:\n");
  console.log ("1: STR",Character1.Strength,"\n","2: DEF",Character1.Defense,"\n","3: LUCK",Character1.Luck,"\n","4: MANA",Character1.Mana,"\n","5: INT",Character1.Intellect,"\n","6: DEX",Character1.Dexterity,"\n\n");
  console.log(colors.yellow("______________________________________________________________\n"));
   AttributeIncrease = input.question(colors.green("Which Attribute would you like to increase?\n\n"));
   

  switch (AttributeIncrease) {
    case "1": 
      Character1.Strength++
      console.log(colors.green("Strength was increased by 1!!\n\n"));
      Character1.AttributePoints--
 PrintCharSheet()
    case "2": 
      Character1.Defense++
      console.log(colors.green("Defense was increased by !!\n\n"));
      Character1.AttributePoints--
  PrintCharSheet()
    case "3": 
      Character1.Luck++
      console.log(colors.green("Luck was increased by 1!\n\n"));
      Character1.AttributePoints--
  PrintCharSheet()
    case "4": 
      Character1.Mana++
      console.log(colors.green("Mana was increased by 1!\n\n"));
      Character1.AttributePoints--
  PrintCharSheet()
    case "5": 
      Character1.Intellect++
      console.log(colors.green("Intellect was increased by 1!\n\n"));
      Character1.AttributePoints--
  PrintCharSheet()
    case "6": 
      Character1.Dexterity++
      console.log(colors.green("Dexterity was increased by 1!\n\n"));
      Character1.AttributePoints--
      PrintCharSheet()
  };
  };
  };
  PrintCharSheet();
  console.clear();
  HUD();
  MOVING();

  console.clear()
  console.log(colors.green("Current Equipment.\n"));
  console.log("-----------------------------------------------------------------\n")
  console.log("Weapon",Character1.Weapon,"\n");
  console.log("Armor",Character1.Armor,"\n");
  console.log("Headpiece", Character1.Headpiece,"\n");
  console.log("Legs",Character1.Legs,"\n");
  console.log("Gloves",Character1.Gloves,"\n");
  console.log("Boots",Character1.Boots,"\n");
  console.log("Left-Ring",Character1.L_Ring,"\n");
  console.log("Right Ring",Character1.R_Ring,"\n");
  console.log("-----------------------------------------------------------------\n")
  Return = input.question(colors.green("Type 1 to return to Main Screen"));
switch (Return) {
  case "1":
  console.clear()
  HUD();
  MOVING();
}
case '7': 
  GenerateItem();
  Return = input.question(colors.green("Type 1 to return to Main Screen"));
switch (Return) {
  case "1":
  HUD();
  MOVING();
};

}
function Shop() {
  let ShopQuestion;
  let ShopInv = {
    Jerky: 1,
    Sirloin: 1,
    Water: 1,
    Herb: 1,
  };
  console.log("Hello! Welcome to my Shop!\n");
ShopQuestion = input.question("Would you like to buy something? Or Perhaps youre looking to sell?\n\n");

switch (ShopQuestion) {
  
  case "Buy":
  console.clear();
   console.log (Object.entries(ShopInv));
   console.log("\n\n My Stock is Limited until the Goblins Between Here and the Next town are cleared out. Sorry!");
   BuyChoice = input.question("What are ya Buyin'?\n")
   BuyAmount = input.question("And How Many?\n");
   console.log ("Heh, heh, heh... Thank you.");
   for ( i = 0; i < BuyAmount; i++) {
   Character1.IInv.push(BuyChoice);
   }
   console.log(Character1.js.IInv);
   HUD();
   MOVING();

   case "Sell":
   console.clear();
   SellChoice = input.question("What are ya Sellin'?");
   let SoldItem = SellChoice;
   SellAmount = input.question("And how Many?");
  
  for (var i=Character1.Inv.length-1; i>=SellAmount; i--) {
    if (Character1.Inv[i] === SellChoice) {
        Character1.Inv.splice(i, 1);
    }

   };
   Shop(); 
}
}
////////////////////////////WORK IN PROGRESS
function GenerateItem() {
  //////Instancing Item Quality
 let Items = ["Sword","Staff","Armor","Headpiece","Glove","Boot","Ring"];
 let Sword_type = ["Broken","Rusted","Stone","Bronze","Iron","Steel","Glass"];
 let Staff_type = ["Broken","Wooden","Stone","Bronze","Iron","Steel","Glass"];
 let Armor_type = ["Broken","Leather","Wooden","Cloth","Silk","Carapace","Bronze","Iron","Steel","Mithril","DragonScale",];
 let Headpiece_type = ["Broken","Leather","Wooden","Cloth","Carapace","Bronze","Iron","Steel","Mithril","DragonScale",];
 let Glove_type = ["Broken","Leather","Cloth","Carapace","Bronze","Iron","Steel","Mithril","DragonScale",];
 let Boot_type = ["Broken","Leather","Cloth","Carapace","Bronze","Iron","Steel","Mithril","DragonScale",];
 let Ring_type = ["Broken","Wooden","Stone","Brass","Bronze","Iron","Steel","Mithril",];
 let Stat_Buff = ["HP","MP","STR","DEF","LUCK","MANA","INT","DEX",];
 let Stat_Nerf = ["HP","MP","STR","DEF","LUCK","MANA","INT","DEX",];

let ModChance = Math.floor(Math.random() * 10) + Character1.Luck;
let ItemTemplate;
let GeneratedItem;
let GeneratedType;
let GeneratedMod;
let ItemQuality = 0;
let Mods = [];




  ItemTemplate = Items[Math.floor(Math.random()*Items.length)]/////Generates the Type of Item and stores it.
///////////Takes the Item Type and Creates a Quality of that Item
  if (ItemTemplate == "Sword") {
    GeneratedItem = "Sword";
    GeneratedType = Sword_type[Math.floor(Math.random()*Sword_type.length)]
    if (GeneratedType == "Broken") {
      ItemQuality = (ItemQuality - 3);
    };
     if (GeneratedType == "Rusted") {
      ItemQuality = (ItemQuality - 2);
    };
     if (GeneratedType == "Stone") {
      ItemQuality = (ItemQuality - 1);
    };
     if (GeneratedType == "Bronze") {
      ItemQuality = (ItemQuality + 1);
    };
     if (GeneratedType == "Iron") {
      ItemQuality = (ItemQuality + 2);
    };
     if (GeneratedType == "Steel") {
      ItemQuality = (ItemQuality + 3);
    };
     if (GeneratedType == "Glass") {
      ItemQuality = (ItemQuality +4);
    }
    }

    if (ItemTemplate == "Staff") {
    GeneratedItem = "Staff";
    GeneratedType = Staff_type[Math.floor(Math.random()*Staff_type.length)]
    if (GeneratedType == "Broken") {
      ItemQuality = (ItemQuality - 3);
    };
     if (GeneratedType == "Rusted") {
      ItemQuality = (ItemQuality - 2);
    };
     if (GeneratedType == "Stone") {
      ItemQuality = (ItemQuality - 1);
    };
     if (GeneratedType == "Bronze") {
      ItemQuality = (ItemQuality + 1);
    };
     if (GeneratedType == "Iron") {
      ItemQuality = (ItemQuality + 2);
    };
     if (GeneratedType == "Steel") {
      ItemQuality = (ItemQuality + 3);
    };
     if (GeneratedType == "Glass") {
      ItemQuality = (ItemQuality +4);
    }
    }

    if (ItemTemplate == "Armor") {
    GeneratedItem = "Armor";
    GeneratedType = Armor_type[Math.floor(Math.random()*Armor_type.length)]
    if (GeneratedType == "Broken") {
      ItemQuality = (ItemQuality - 3);
    };
     if (GeneratedType == "Rusted") {
      ItemQuality = (ItemQuality - 2);
    };
     if (GeneratedType == "Leather") {
      ItemQuality = (ItemQuality = 0);
    };
    if (GeneratedType == "Wooden") {
      ItemQuality = (ItemQuality + 1);
    }
     if (GeneratedType == "Bronze") {
      ItemQuality = (ItemQuality + 1);
    };
     if (GeneratedType == "Iron") {
      ItemQuality = (ItemQuality + 2);
    };
     if (GeneratedType == "Steel") {
      ItemQuality = (ItemQuality + 3);
    };
     if (GeneratedType == "Glass") {
      ItemQuality = (ItemQuality +4);
    }
    if (GeneratedType == "Mithril") {
      ItemQuality = (ItemQuality +4);
    }
    }

    if (ItemTemplate == "Headpiece") {
    GeneratedItem = "Headpiece";
    GeneratedType = Headpiece_type[Math.floor(Math.random()*Headpiece_type.length)]
    if (GeneratedType == "Broken") {
      ItemQuality = (ItemQuality - 3);
    };
     if (GeneratedType == "Rusted") {
      ItemQuality = (ItemQuality - 2);
    };
     if (GeneratedType == "Stone") {
      ItemQuality = (ItemQuality - 1);
    };
     if (GeneratedType == "Bronze") {
      ItemQuality = (ItemQuality + 1);
    };
     if (GeneratedType == "Iron") {
      ItemQuality = (ItemQuality + 2);
    };
     if (GeneratedType == "Steel") {
      ItemQuality = (ItemQuality + 3);
    };
    if (GeneratedType == "Mithril") {
      ItemQuality = (ItemQuality +4);
    }
     if (GeneratedType == "Glass") {
      ItemQuality = (ItemQuality +4);
    }
    if (GeneratedType == "DragonScale") {
      ItemQuality = (ItemQuality +5);
    }
    }

    if (ItemTemplate == "Glove") {
    GeneratedItem = "Glove";
    GeneratedType = Glove_type[Math.floor(Math.random()*Glove_type.length)]
    if (GeneratedType == "Broken") {
      ItemQuality = (ItemQuality - 3);
    };
     if (GeneratedType == "Rusted") {
      ItemQuality = (ItemQuality - 2);
    };
     if (GeneratedType == "Stone") {
      ItemQuality = (ItemQuality - 1);
    };
     if (GeneratedType == "Bronze") {
      ItemQuality = (ItemQuality + 1);
    };
     if (GeneratedType == "Iron") {
      ItemQuality = (ItemQuality + 2);
    };
     if (GeneratedType == "Steel") {
      ItemQuality = (ItemQuality + 3);
    };
     if (GeneratedType == "Glass") {
      ItemQuality = (ItemQuality +4);
    }
    if (GeneratedType == "Carapace") {
      ItemQuality = (ItemQuality +2);
    }
    }

    if (ItemTemplate == "Boot") {
    GeneratedItem = "Boots";
    GeneratedType = Boot_type[Math.floor(Math.random()*Boot_type.length)]
    if (GeneratedType == "Broken") {
      ItemQuality = (ItemQuality - 3);
    };
     if (GeneratedType == "Rusted") {
      ItemQuality = (ItemQuality - 2);
    };
     if (GeneratedType == "Cloth") {
      ItemQuality = (ItemQuality - 1);
    };
     if (GeneratedType == "Leather") {
      ItemQuality = (ItemQuality + 1);
    };
     if (GeneratedType == "Iron") {
      ItemQuality = (ItemQuality + 2);
    };
     if (GeneratedType == "Steel") {
      ItemQuality = (ItemQuality + 3);
    };
     if (GeneratedType == "Mithril") {
      ItemQuality = (ItemQuality +4);
    }
    if (GeneratedType == "Carapace") {
      ItemQuality = (ItemQuality +2);
    }
    }

    if (ItemTemplate == "Ring") {
      ItemStatMod = 
    GeneratedItem = "Ring";
    GeneratedType = Ring_type[Math.floor(Math.random()*Ring_type.length)]
    if (GeneratedType == "Broken") {
      ItemQuality = (ItemQuality - 3);
    };
     if (GeneratedType == "Rusted") {
      ItemQuality = (ItemQuality - 2);
    };
     if (GeneratedType == "Stone") {
      ItemQuality = (ItemQuality - 1);
    };
     if (GeneratedType == "Bronze") {
      ItemQuality = (ItemQuality + 1);
    };
     if (GeneratedType == "Iron") {
      ItemQuality = (ItemQuality + 2);
    };
     if (GeneratedType == "Steel") {
      ItemQuality = (ItemQuality + 3);
    };
     if (GeneratedType == "Glass") {
      ItemQuality = (ItemQuality +4);
    }
    }
    if (ItemQuality >= 1) {
      function GenerateItemBuff() {
      GeneratedMod = Stat_Buff[Math.floor(Math.random()*Stat_Buff.length)]
      }
      for (let i = 0; i <= ItemQuality; i++) {
        Mods[i] = GeneratedMod
        GenerateItemBuff();
      }
    }

  
  let FinishedItem = {
  Type: "",
  Item:"",
  Quality: ItemQuality,
  Mod1: Mods[1],
  Mod2: Mods[2],
  Mod3: Mods[3],
  Mod4: Mods[4],
  Mod5: Mods[5],
};
  FinishedItem.Type = GeneratedType
  FinishedItem.Item = GeneratedItem
  FinishedItem.Quality = ItemQuality
  console.log(colors.green("You Found...", Object.entries(FinishedItem)));
  HUD();
  MOVING();
};
};
