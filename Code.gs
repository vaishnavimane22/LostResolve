// ========== CONFIGURATION ==========
const LOST_SHEET = "LostItems";
const FOUND_SHEET = "FoundItems";
const USERS_SHEET = "Users";
const NotMine = "NotMine";
const DRIVE_FOLDER_ID = "15dTaebsaLo-NwLi-s6-Iy5VJ9sw9LbT5"; // <-- replace this with your folder ID

var ss = SpreadsheetApp.getActiveSpreadsheet();

// ========== AUTO-CREATE SHEETS ==========
function initSheets() {
  ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(USERS_SHEET)) {
    let sh = ss.insertSheet(USERS_SHEET);
    sh.appendRow(["Name", "Institute", "Email", "Contact", "Password"]);
  }
  if (!ss.getSheetByName(LOST_SHEET)) {
    let sh = ss.insertSheet(LOST_SHEET);
    sh.appendRow(["Name", "Email", "Contact", "Category", "Item", "Description", "ImageURL", "Timestamp"]);
  }
  if (!ss.getSheetByName(FOUND_SHEET)) {
    let sh = ss.insertSheet(FOUND_SHEET);
    sh.appendRow(["Name", "Email", "Contact", "Category", "Item", "Description", "ImageURL", "Timestamp"]);
  }
  if (!ss.getSheetByName("NotMine")) {
    let sh = ss.insertSheet("NotMine");
    sh.appendRow(["UserEmail", "LostRow", "FoundRow", "Timestamp"]);
  }
}

// ========== REGISTRATION ==========
function registerUser(name, institute, email, contact, password) {
  if (!name || !email || !contact || !password) {
    return { success: false, message: "Please fill all required fields." };
  }
  let sheetUsers = ss.getSheetByName(USERS_SHEET);
  let data = sheetUsers.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase() === String(email).toLowerCase()) {
      return { success: false, message: "Email already registered!" };
    }
  }
  sheetUsers.appendRow([name, institute, email, contact, password]);
  return { success: true, message: "Registration successful! Please login." };
}

// ========== LOGIN ==========
function loginUser(email, password) {
  if (!email || !password) return { success: false, message: "Provide email and password." };
  let sheetUsers = ss.getSheetByName(USERS_SHEET);
  let data = sheetUsers.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase() === String(email).toLowerCase() && data[i][4] === password) {
      return {
        success: true,
        name: data[i][0],
        institute: data[i][1],
        email: data[i][2],
        contact: data[i][3]
      };
    }
  }
  return { success: false, message: "Invalid email or password!" };
}

// ========== HELPER: save base64 image to Drive ==========
function saveBase64ToDrive(base64Image, prefix) {
  if (!base64Image) return "";
  try {
    var parts = base64Image.split(',');
    if (parts.length < 2) return "";
    var meta = parts[0]; // "data:image/png;base64"
    var data = parts[1];
    var mimeMatch = meta.match(/data:(image\/[a-zA-Z0-9.+-]+);base64/);
    var mime = mimeMatch ? mimeMatch[1] : 'image/png';
    var ext = mime.split('/')[1];
    var bytes = Utilities.base64Decode(data);
    var blob = Utilities.newBlob(bytes, mime, prefix + "_" + Date.now() + "." + ext);
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    // on error return empty string (caller can still save record without image)
    return "";
  }
}

// ========== SAVE LOST / FOUND ==========
function saveLostItem(name, email, contact, category, item, description, base64Image) {
  var imageUrl = base64Image ? saveBase64ToDrive(base64Image, "lost") : "";
  var sheet = ss.getSheetByName(LOST_SHEET);
  sheet.appendRow([name || "", email || "", contact || "", category || "", item || "", description || "", imageUrl, new Date()]);
  return { success: true, message: "Lost item submitted successfully!" };
}

function saveFoundItem(name, email, contact, category, item, description, base64Image) {
  var imageUrl = base64Image ? saveBase64ToDrive(base64Image, "found") : "";
  var sheet = ss.getSheetByName(FOUND_SHEET);
  sheet.appendRow([name || "", email || "", contact || "", category || "", item || "", description || "", imageUrl, new Date()]);
  return { success: true, message: "Found item submitted successfully!" };
}

// ========== Matches ==========
// ===== FUZZY MATCH HELPER =====
function similarity(str1, str2) {
  if (!str1 || !str2) return 0;
  str1 = str1.toLowerCase();
  str2 = str2.toLowerCase();
  
  let longer = str1.length > str2.length ? str1 : str2;
  let shorter = str1.length > str2.length ? str2 : str1;
  
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length;
}

// ===== GET MATCHES =====
function getMatches(userEmail) {
  let lostSheet = ss.getSheetByName(LOST_SHEET);
  let foundSheet = ss.getSheetByName(FOUND_SHEET);
  let lostData = lostSheet.getDataRange().getValues();
  let foundData = foundSheet.getDataRange().getValues();

  let matches = [];

  // Load "Not Mine" rejections
  let notMineSheet = ss.getSheetByName("NotMine");
  let notMineData = notMineSheet ? notMineSheet.getDataRange().getValues() : [];

  for (let i = 1; i < lostData.length; i++) {
    if (lostData[i][1] !== userEmail) continue; // Only this user's lost items
      
    let lostCategory = lostData[i][3];
    let lostItem = lostData[i][4];
    let lostDesc = lostData[i][5];

    for (let j = 1; j < foundData.length; j++) {
      let foundCategory = foundData[j][3];
      let foundItem = foundData[j][4];
      let foundDesc = foundData[j][5];
      let foundImage = foundData[j][6];

      // First check category must match
      if (lostCategory !== foundCategory) continue;

      // Fuzzy check
      let itemScore = similarity(lostItem, foundItem);
      let descScore = similarity(lostDesc, foundDesc);

      if (itemScore >= 0.6 || descScore >= 0.5) {
        // Skip if already marked as "Not Mine"
        let alreadyRejected = notMineData.some(r =>
          r[0] === userEmail && String(r[1]) === String(i+1) && String(r[2]) === String(j+1)
        );
        if (alreadyRejected) continue;

        matches.push({
          lostRow: i+1,
          foundRow: j+1,
          item: foundItem,
          description: foundDesc,
          image: foundImage,
          finderEmail: foundData[j][1],
          finderContact: foundData[j][2]
        });
      }
    }
  }
  return matches;
}

// ===== NEW: CONFIRM CLAIM =====
function confirmClaim(foundRow, lostRow) {
  let lostSheet = ss.getSheetByName(LOST_SHEET);
  let foundSheet = ss.getSheetByName(FOUND_SHEET);

  lostSheet.deleteRow(Number(lostRow));
  foundSheet.deleteRow(Number(foundRow));

  return true;
}

// ========== NOT MINE ==========
function markNotMine(userEmail, lostRow, foundRow) {
  let sheet = ss.getSheetByName("NotMine");
  sheet.appendRow([userEmail, lostRow, foundRow, new Date()]);
  return true;
}

// ========== UNDO NOT MINE ==========
function undoNotMine(userEmail, lostRow, foundRow) {
  let sheet = ss.getSheetByName("NotMine");
  let data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (
      data[i][0] === userEmail &&
      String(data[i][1]) === String(lostRow) &&
      String(data[i][2]) === String(foundRow)
    ) {
      sheet.deleteRow(i + 1); // +1 because sheet rows are 1-indexed
      return true;
    }
  }
  return false;
}

// ========== SERVE FRONTEND ==========
function doGet(e) {
  initSheets(); // ensure sheets exist
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('LostResolve')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
