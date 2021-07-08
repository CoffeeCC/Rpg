const colors = require('colors/safe');
const input = require("readline-sync");
 let Wooden_Staff = {
      Attack: 1,
      Magic: 5,

    };
let MonsterNamesPRE = ["Gro","Zoo","Glo","Gru","Dro","Dre","Zar","Klo","Gre","Spoo","Tre","Glar","Zar","Kar","Tar","Tu","Har","glee","tug"];
let MonsterNamesSUF = ["Gro","Zoo","Glo","Gru","Dro","Dre","Zar","Klo","Gre","Spoo","Tre","Glar","Zar","Kar","Tar","Tu","Har","glee","tug"];
function HUD() {
  console.log("--------------------------------------------------------------\nLocation:",Location,"Progress",Character1.Progress);
  console.log(" Name:",Character1.Name,"\n","Health:",Character1.HP,"\n","Race:",Character1.Race,"\n","Class:",Character1.Class,"\n--------------------------------------------------------------\n");
}

let Start =[""]
let ItemList = ["Green Herb","Red Herb","Yellow Herb",]
let Races = ["Human","Elf","Dwarf",""];
let Classes = ["Warrior", "Mage","Thief","Bard","Knight",]
let Location = ["Town"];
let Character1 = {
  Start: " ",
  Name:  " ",
  Race:  " ",
  Class:  " ",
  Level:  1,
  HP: 1,
  Strength: 1,
  MaxHP: 100,
  Progress: 1,
  Search: 1,
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
Character1.Name = input.question("Please enter your name... \n\n");

console.log("Characters name is", Character1.Name,"\n\n");


  console.log("Please Choose a Race\n");
for (i = 0; i < Races.length; i++) {
  console.log(Races[i]);
}
Character1.Race = input.question("\n");

console.log("Please Choose a Class\n");
for (i = 0; i < Classes.length; i++) {
  console.log(Classes[i]);
}
Character1.Class = input.question("\n");

Character1.Start = input.question("Does everything look correct? Would you like to Begin? (Y/N)\n");
if (Character1.Start == "Y") {
  console.clear();
  if(Character1.race = "Human") {
    Character1.HP = 100;
    Character1.MP = 50;
    Character1.Strength = 3;
    Character1.Luck = 3;
    Character1.Mana = 3;
    Character1.Intellect = 3;
    Character1.Agility = 3;
    Character1.MaxHP = 100;
    };
    if(Character1.Class = "Mage") {
      Character1.Weapon = Wooden_Staff;
      Character1.Armor = "Apprentice Robes";
      Character1.Spells = (colors.red("1. Flare"))+(colors.yellow("2. Stun"))+(colors.blue("3. Spout"));
    }
};
if (Character1.Start == "N") {
  CreateCharacter();
};

HUD();
MOVING();
};












////////////////////////Function Storage/////////////
function CombatHUD() {
  let R = Math.floor(Math.random() * 3);
  let Dmg = 0;
  let Mag = 0
  console.log(" *****************************************************************************")
    console.log(Character1.Name,"   |  ", Monster1.Name,"HP",Monster1.MonsterHP,"Level:",Monster1.Level,"\n","HP:",Character1.HP,"\n","MP:",Character1.MP,"\n","*****************************************************************************");
  console.log(colors.blue("1: Attack\n"));
  console.log(colors.blue("2: Defend\n"));
  console.log(colors.blue("3: Magic\n"));
  console.log(colors.blue("4: Tame\n"));
  console.log(colors.blue("5: Items\n"));
   CombatAction = input.question("Choose an Action...\n");
   console.clear();
   console.log("-----------------------------------------------------------------\n")
  switch(CombatAction) {
    case '1':
    console.log(colors.green(Character1.Name,"Attacked",Monster1.Name,"!"));
    Dmg = (Character1.Strength + Character1.Weapon.Attack + R) - (Monster1.Defense);
    console.log(colors.green(Monster1.Name,"Suffered",Dmg,"Damage!\n"));
    Monster1.MonsterHP = (Monster1.MonsterHP - Dmg)
    CombatHUD();
    case '2':
    case '3':
    let Spells = Character1.Spells
    console.log(Spells);
    console.log("\n");
    SpellChoice = input.question("Choose a Spell...");
    if (SpellChoice == 1 && Character1.Class == "Mage") {
console.log(colors.green(Character1.Name),"Cast"(colors.red("Flare!"),Monster1.Name,"!"));
    }
    case '4':
  }
  };
function CreateMonster() {
let R = Math.floor(Math.random() * 3);
Monster1.Defense = Math.floor(Math.random() * 3) + Monster1.Level,
Monster1.MonsterHP = Math.floor(Math.random() * 30) + Character1.Level,
Monster1.MaxHP = Monster1.MonsterHP,
Monster1.Level = (Math.floor(Math.random()* 5)) + Character1.Level,
Monster1.MonsterXP = (Monster1.MonsterHP/2),
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
  console.log("1. Move Forwards.\n");
  console.log("2. Rest.\n");
  console.log("3. Move Backwards.\n");
  console.log("4. Search\n");
  console.log("EncounterChance",EncounterChance,"ItemChance",ItemChance);
Choice = input.question("______________________________________________________________\n");
///Maybe use a switch for this?
  if (Choice == 1){
Character1.Progress++
Character1.Search++
if (EncounterChance >= 5) {
  //run create montser Function here

  console.clear();
  CreateMonster();
  CombatHUD();
}
else {
  HUD();
  MOVING();
}
  }
  if (Choice == 2) {
    //Rest and Gain Health,Day Progresses.
  }
  if (Choice == 3) {
Character1.Progress--
  }
  if (Choice == 4) {
    if (Character1.Search >= 1) {
    console.log("You Search the Area for Anything Useful\n");
    if (ItemChance > 6) {
      console.log("You found a",ItemList[Math.floor(Math.random()*ItemList.length)]);
      console.log("\n\n\n");
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
};
};
   
  