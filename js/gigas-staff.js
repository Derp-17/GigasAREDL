(() => {
  "use strict";
  // Add confirmed names to the appropriate arrays below.
  // This directory is informational and does not grant permissions.
  const staff = [
    { role: "Owner", members: [] },
    { role: "Admins", members: [] },
    { role: "Moderators", members: [] },
    { role: "Trial Mods", members: [] },
    { role: "Coder", members: [] }
  ];
  const grid = document.getElementById("staff-grid");
  for (const group of staff) {
    const card = document.createElement("section");
    card.className = "staff-card";
    const role = document.createElement("span");
    role.className = "staff-role";
    role.textContent = group.role;
    card.append(role);
    if (!group.members.length) {
      const placeholder = document.createElement("span");
      placeholder.className = "staff-name";
      placeholder.textContent = "To be announced";
      card.append(placeholder);
    } else {
      for (const name of group.members) {
        const member = document.createElement("span");
        member.className = "staff-name";
        member.textContent = name;
        card.append(member);
      }
    }
    grid.append(card);
  }
})();