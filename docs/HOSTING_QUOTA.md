---

Firebase Hosting – när lagringen tar slut (playbook)

Symptom: Deploy misslyckas p.g.a. Hosting storage (tidigare releaser + versioner tar plats).
Bakgrund: Varje deploy skapar en release som pekar på en version. Filerna för både aktuell release och sparade tidigare releaser räknas mot Hosting-lagringen (gratis upp till 10 GB; max 2 GB per enskild fil). 

A) Snabb åtgärd – få utrymme nu

1. Radera gamla preview-kanaler (de tar plats via sina releaser/ versioner)

CLI (snabbt):

firebase hosting:channel:list
firebase hosting:channel:delete <CHANNEL_ID>

Tips: nästa deploy till preview, sätt utgångstid direkt:

firebase hosting:channel:deploy labs --expires 7d

(Förhandskanaler kan tidsstyras upp till 30 dagar.) 



2. Radera äldre releaser i live-kanalen (UI)

Gå till Hosting → Release history, hovra en äldre release → Delete.

Notera: du kan inte radera den release som just nu är live; raderingen schemaläggs (inom 24 h). 




> Obs: Hosting rensar inte allt omedelbart; radering är schemalagd. Prova deploy igen när du frigjort plats, eller rensa fler. 



B) Förebygg – undvik att slå i taket igen

1. Sätt “releases to keep” för live + preview-kanaler

Hosting → Release history → ⋮ → Release storage settings (live)

Hosting → Channels → ⋮ → Channel settings (preview)
Ange t.ex. 10 för live och 3 för preview. Överskjutande releasers innehåll schemaläggs för radering. 



2. Ge alla preview-deploys utgångstid

CLI: firebase hosting:channel:deploy mybranch --expires 7d
När kanalen löper ut tas kanal + releases + versioner bort (inom ~24 h). 



3. Deploya endast byggmappen
I firebase.json:

{ "hosting": { "public": "dist", "ignore": ["firebase.json","**/.*","**/node_modules/**"] } }

Då är det bara dist/ som publiceras. Lägg aldrig källkod, tester eller stora assets där. 


4. Flytta stora filer till Cloud Storage + CDN
Hosting har 2 GB filgräns; stora media → lagra i Cloud Storage och länka från appen. 


5. Scripta (frivilligt, community)
Om du vill rensa många versioner programmatiskt finns ett community-script som tar bort alla utom N senaste versionerna för ett site-namn: dry-run och sedan “commit”. (Inofficiellt; använd med försiktighet.) 




---

C) Snabba kommandon (klipp & kör)

# Lista kanaler (inkl. live)
firebase hosting:channel:list

# Ta bort en förhandskanal som du inte längre behöver
firebase hosting:channel:delete <CHANNEL_ID>

# Deploya en preview med automatisk utgång efter 7 dagar
firebase hosting:channel:deploy labs --expires 7d

# Deploya endast hosting (när du frigjort plats)
firebase deploy --only hosting




---

D) Vanliga missförstånd

“Deploy = pusha till GitHub” → Nej. GitHub är källkod; deploy laddar upp byggfiler till Hosting. Det är deployen som ökar Hosting-lagringen. 

“Firebase har ett eget Git som fyller utrymme” → Nej. Hosting lagrar versionspaket av filer, inte ett git-repo. 



---

E) Minimal .firebaseignore (lägg i rotmappen)

**/node_modules/**
**/dist/**
**/build/**
**/.next/**  **/.output/**  **/coverage/**
**/__tests__/**  **/cypress/**  **/*.spec.*  **/*.test.*
**/*.map  **/*.snap  **/*.log
**/.DS_Store  **/.vscode/**  **/Thumbs.db

Detta hindrar misstag där stora mappar råkar åka med. (Hosting deployar ändå bara public-mappen enligt firebase.json.) 


---

F) Text som Firebase-assistenten kan visa vid fel

> Hosting-lagringen är full.
Gör så här i tur och ordning:

1. Radera äldre preview-kanaler:
firebase hosting:channel:list → firebase hosting:channel:delete <CHANNEL_ID>


2. Radera äldre releaser i live-kanalen (UI): Hosting → Release history → välj en tidigare release → Delete.


3. Sätt tak på sparade releaser: Hosting → Release storage settings → välj t.ex. 10 (live) / 3 (preview).


4. Deploya om: firebase deploy --only hosting


5. Förebygg: Använd --expires 7d på alla preview-deploys.
Läs mer: “Manage hosting resources” och “Hosting usage & quotas” i dokumentationen. 






---
