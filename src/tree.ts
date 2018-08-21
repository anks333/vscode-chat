import * as vscode from "vscode";
import * as path from "path";
import Store from "./store";
import { SelfCommands } from "./constants";
import { SlackChannel, SlackUser } from "./interfaces";

interface ChatTreeItem {
  isOnline: boolean;
  value: string;
  label: string;
  channel: SlackChannel;
  user: SlackUser;
}

const GREEN_DOT_PATH = "public/icons/green.svg";

export default class ChatTreeProviders {
  unreads: UnreadsTreeProvider;
  channels: ChannelTreeProvider;
  ims: IMsTreeProvider;
  groups: GroupTreeProvider;
  users: OnlineUsersTreeProvider;

  constructor(private store: Store, context: vscode.ExtensionContext) {
    this.unreads = new UnreadsTreeProvider(store, context);
    this.channels = new ChannelTreeProvider(store, context);
    this.groups = new GroupTreeProvider(store, context);
    this.ims = new IMsTreeProvider(store, context);
    this.users = new OnlineUsersTreeProvider(store, context);

    this.setupCallbacks();
  }

  setupCallbacks() {
    this.store.setTreeCallback(() => this.unreads.refresh());
    this.store.setTreeCallback(() => this.channels.refresh());
    this.store.setTreeCallback(() => this.groups.refresh());
    this.store.setTreeCallback(() => this.ims.refresh());
    this.store.setTreeCallback(() => this.users.refresh());
  }

  updateStore(store: Store) {
    this.store = store;
    this.unreads.updateStore(store);
    this.channels.updateStore(store);
    this.groups.updateStore(store);
    this.ims.updateStore(store);
    this.users.updateStore(store);

    this.setupCallbacks();
  }

  register(): vscode.Disposable[] {
    const registrar = vscode.window.registerTreeDataProvider;
    return [
      registrar("unreads-tree-view", this.unreads),
      registrar("channels-tree-view", this.channels),
      registrar("groups-tree-view", this.groups),
      registrar("ims-tree-view", this.ims),
      registrar("online-users-tree-view", this.users)
    ];
  }
}

class CustomTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    isOnline: boolean,
    channel: SlackChannel,
    user: SlackUser,
    greenDot: string
  ) {
    super(label);

    this.contextValue = "channel";

    if (isOnline) {
      this.iconPath = {
        light: greenDot,
        dark: greenDot
      };
    }

    this.command = {
      command: SelfCommands.OPEN,
      title: "",
      arguments: [{ channel, user }]
    };
  }
}

class BaseTreeProvider implements vscode.TreeDataProvider<ChatTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChatTreeItem>();
  readonly onDidChangeTreeData? = this._onDidChangeTreeData.event;
  private greenDot: string;

  constructor(protected store: Store, context: vscode.ExtensionContext) {
    this.greenDot = context.asAbsolutePath(GREEN_DOT_PATH);
  }

  refresh(): void {
    // We can also refresh specific items, but since the ordering
    // might change we refresh the entire tree.
    this._onDidChangeTreeData.fire();
  }

  updateStore(store: Store) {
    this.store = store;
  }

  getTreeItem(element: ChatTreeItem): vscode.TreeItem {
    // TODO: when selected, the highlight on the tree item seems to stick. This might
    // be because we don't use URIs (~= each channel is a URI) to open/close. Need to investigate.
    const { label, isOnline, channel, user } = element;
    const treeItem = new CustomTreeItem(
      label,
      isOnline,
      channel,
      user,
      this.greenDot
    );
    return treeItem;
  }

  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    throw new Error("Method not implemented");
  }

  getParent?(element: ChatTreeItem): vscode.ProviderResult<ChatTreeItem> {
    throw new Error("Method not implemented");
  }

  getChildrenForType(
    filterFn,
    sortingFn?
  ): vscode.ProviderResult<ChatTreeItem[]> {
    return new Promise(resolve => {
      const channels = this.store.getChannelLabels().sort(sortingFn);
      resolve(
        channels.filter(filterFn).map(channel => ({
          value: channel.id,
          label: channel.label,
          isOnline: channel.isOnline,
          channel,
          user: null
        }))
      );
    });
  }
}

class UnreadsTreeProvider extends BaseTreeProvider {
  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    return this.getChildrenForType(
      c => c.unread > 0,
      (a, b) => b.unread - a.unread
    );
  }
}

class ChannelTreeProvider extends BaseTreeProvider {
  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    return this.getChildrenForType(c => c.type === "channel");
  }
}

class GroupTreeProvider extends BaseTreeProvider {
  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    return this.getChildrenForType(c => c.type === "group");
  }
}

class IMsTreeProvider extends BaseTreeProvider {
  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    return this.getChildrenForType(c => c.type === "im");
  }
}

class OnlineUsersTreeProvider extends BaseTreeProvider {
  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    return new Promise(resolve => {
      const { id: currentId } = this.store.currentUserInfo;
      const users: SlackUser[] = Object.keys(this.store.users)
        .map(userId => this.store.users[userId])
        .filter(user => user.isOnline && user.id !== currentId);
      resolve(
        users.map(user => ({
          value: user.name,
          label: user.name,
          isOnline: user.isOnline,
          user,
          channel: this.store.getIMChannel(user)
        }))
      );
    });
  }
}
