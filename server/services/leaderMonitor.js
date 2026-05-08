export class LeaderMonitor {
  constructor({ store, adapter, realtime, intervalMs = 30000, logger = console } = {}) {
    this.store = store;
    this.adapter = adapter;
    this.realtime = realtime;
    this.intervalMs = intervalMs;
    this.logger = logger;
    this.timer = null;
    this.status = 'idle';
    this.lastError = null;
  }

  start() {
    if (this.timer) {
      return;
    }
    this.status = 'running';
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  async poll() {
    const leaders = this.store.listLeaders().filter((leader) => leader.status !== 'paused');
    for (const leader of leaders) {
      try {
        const snapshot = this.adapter.fetchSnapshot
          ? await this.adapter.fetchSnapshot(leader.leaderId)
          : { trades: await this.adapter.fetchTrades(leader.leaderId) };
        if (snapshot.profile || snapshot.metrics) {
          this.store.updateLeaderSnapshot(leader.leaderId, snapshot);
          this.realtime?.broadcast('leader.profile.updated', this.store.getLeader(leader.leaderId));
        }
        const trades = snapshot.trades || [];
        for (const trade of trades) {
          const result = this.store.insertLeaderTrade(trade);
          if (result.inserted) {
            this.realtime?.broadcast('leader.trade.updated', result.trade);
          }
        }
      } catch (error) {
        this.lastError = error.message;
        this.store.markLeaderError(leader.leaderId, error);
        this.store.addSystemEvent('warn', '带单员数据采集失败', { leaderId: leader.leaderId, error: error.message });
        this.realtime?.broadcast('system.status.updated', this.getStatus());
      }
    }
  }

  getStatus() {
    return {
      leaderPoller: this.status,
      leaderLastError: this.lastError
    };
  }

  close() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = 'idle';
  }
}
