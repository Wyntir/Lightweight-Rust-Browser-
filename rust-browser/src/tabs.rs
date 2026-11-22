use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceId {
    Personal,
    Work,
    Gaming,
    Development,
}

impl WorkspaceId {
    pub const ALL: [WorkspaceId; 4] = [
        WorkspaceId::Personal,
        WorkspaceId::Work,
        WorkspaceId::Gaming,
        WorkspaceId::Development,
    ];

    pub fn label(self) -> &'static str {
        match self {
            WorkspaceId::Personal => "Personal",
            WorkspaceId::Work => "Work",
            WorkspaceId::Gaming => "Gaming",
            WorkspaceId::Development => "Development",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Tab {
    pub id: u64,
    pub workspace: WorkspaceId,
    pub group_name: Option<String>,
    pub title: String,
    pub url: String,
    pub history: Vec<String>,
    pub history_index: usize,
    pub pinned: bool,
    pub hibernated: bool,
    pub is_private: bool,
    pub estimated_ram_mb: u64,
    pub last_active: Instant,
}

pub struct TabManager {
    next_id: u64,
    active_workspace: WorkspaceId,
    active_tab_id: Option<u64>,
    split_tab_id: Option<u64>,
    pub vertical_tabs: bool,
    tabs: Vec<Tab>,
}

impl TabManager {
    pub fn new() -> Self {
        let mut manager = Self {
            next_id: 1,
            active_workspace: WorkspaceId::Personal,
            active_tab_id: None,
            split_tab_id: None,
            vertical_tabs: false,
            tabs: Vec::new(),
        };
        manager.open_tab("ferrox://speed-dial", "Speed Dial", false);
        manager
    }

    pub fn active_workspace(&self) -> WorkspaceId {
        self.active_workspace
    }

    pub fn active_tab_id(&self) -> Option<u64> {
        self.active_tab_id
    }

    pub fn split_tab_id(&self) -> Option<u64> {
        self.split_tab_id
    }

    pub fn workspace_tabs(&self) -> Vec<&Tab> {
        self.tabs
            .iter()
            .filter(|t| t.workspace == self.active_workspace)
            .collect()
    }

    pub fn active_tab(&self) -> Option<&Tab> {
        let id = self.active_tab_id?;
        self.tabs.iter().find(|t| t.id == id)
    }

    pub fn open_tab(&mut self, url: &str, title: &str, is_private: bool) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        let tab = Tab {
            id,
            workspace: self.active_workspace,
            group_name: None,
            title: title.to_string(),
            url: url.to_string(),
            history: vec![url.to_string()],
            history_index: 0,
            pinned: false,
            hibernated: false,
            is_private,
            estimated_ram_mb: if url.starts_with("ferrox://") { 24 } else { 96 },
            last_active: Instant::now(),
        };
        self.tabs.push(tab);
        self.active_tab_id = Some(id);
        id
    }

    pub fn activate_tab(&mut self, id: u64) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            tab.hibernated = false;
            tab.last_active = Instant::now();
            self.active_tab_id = Some(id);
        }
    }

    pub fn toggle_pin(&mut self, id: u64) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            tab.pinned = !tab.pinned;
        }
    }

    pub fn set_group(&mut self, id: u64, group_name: Option<String>) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            tab.group_name = group_name;
        }
    }

    pub fn set_split_tab(&mut self, id: Option<u64>) {
        self.split_tab_id = id;
    }

    pub fn close_tab(&mut self, id: u64) {
        let ws = self.active_workspace;
        if self.split_tab_id == Some(id) {
            self.split_tab_id = None;
        }
        self.tabs.retain(|t| t.id != id);
        if let Some(next_tab) = self.tabs.iter().rfind(|t| t.workspace == ws) {
            if self.active_tab_id == Some(id) {
                self.active_tab_id = Some(next_tab.id);
            }
        } else {
            self.open_tab("ferrox://speed-dial", "Speed Dial", false);
        }
    }

    pub fn switch_workspace(&mut self, ws: WorkspaceId) {
        self.active_workspace = ws;
        if let Some(first) = self.tabs.iter().find(|t| t.workspace == ws) {
            self.active_tab_id = Some(first.id);
        } else {
            self.open_tab("ferrox://speed-dial", "Speed Dial", false);
        }
    }

    pub fn navigate_active(&mut self, url: &str) {
        let Some(id) = self.active_tab_id else {
            return;
        };
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            tab.history.truncate(tab.history_index + 1);
            tab.history.push(url.to_string());
            tab.history_index = tab.history.len() - 1;
            tab.url = url.to_string();
            tab.title = url.to_string();
            tab.hibernated = false;
            tab.estimated_ram_mb = if url.starts_with("ferrox://") { 24 } else { 112 };
            tab.last_active = Instant::now();
        }
    }

    pub fn go_back(&mut self) {
        let Some(id) = self.active_tab_id else { return };
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            if tab.history_index > 0 {
                tab.history_index -= 1;
                tab.url = tab.history[tab.history_index].clone();
            }
        }
    }

    pub fn go_forward(&mut self) {
        let Some(id) = self.active_tab_id else { return };
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            if tab.history_index + 1 < tab.history.len() {
                tab.history_index += 1;
                tab.url = tab.history[tab.history_index].clone();
            }
        }
    }

    pub fn hibernate_oldest_background_tab(&mut self) -> u64 {
        let active = self.active_tab_id;
        let split = self.split_tab_id;
        let candidate = self
            .tabs
            .iter_mut()
            .filter(|t| Some(t.id) != active && Some(t.id) != split && !t.pinned && !t.hibernated)
            .min_by_key(|t| t.last_active);
        if let Some(tab) = candidate {
            let reclaimed = tab.estimated_ram_mb.saturating_sub(8);
            tab.hibernated = true;
            tab.estimated_ram_mb = 8;
            reclaimed
        } else {
            0
        }
    }

    pub fn hibernate_all_inactive(&mut self) {
        let active = self.active_tab_id;
        let split = self.split_tab_id;
        for tab in &mut self.tabs {
            if Some(tab.id) != active && Some(tab.id) != split && !tab.pinned {
                tab.hibernated = true;
                tab.estimated_ram_mb = 8;
            }
        }
    }
}
