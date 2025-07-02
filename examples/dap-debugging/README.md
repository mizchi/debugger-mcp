# DAP MCP デバッグ例

このディレクトリには、DAP MCP (Debug Adapter Protocol Model Context Protocol) を使用したデバッグの実例が含まれています。

## ファイル一覧

### 1. `lcs-algorithm.js`
最長共通部分列（LCS）アルゴリズムの実装例です。動的計画法の典型的な例で、以下のデバッグポイントを観察できます：
- DPテーブルの構築過程
- 文字の一致判定ロジック
- バックトラックによる解の復元

**デバッグポイント:**
- 24行目: DPテーブル更新時の値の変化
- 35行目: LCS復元時のバックトラック過程

### 2. `debug-session-example.js`
DAP MCPツールの基本的な使い方を示すサンプルプログラムです。以下を含みます：
- フィボナッチ数列の計算（再帰）
- 配列処理と条件付きログ出力
- 完全なデバッグセッションのコマンド例

**主な機能:**
- セッション管理
- ブレークポイント設定（条件付き含む）
- 変数の確認と値の追跡
- デバッグログの記録と分析

### 3. `performance-debugging.js`
パフォーマンス問題のデバッグ方法を示す例です：
- 非効率なフィボナッチ実装（メモ化なし）
- 効率的なフィボナッチ実装（メモ化あり）
- 大規模配列の処理性能測定

**デバッグテクニック:**
- 関数呼び出し頻度の確認
- 実行時間の測定と警告
- ボトルネックの特定

## 使用方法

### 基本的なデバッグセッション

```javascript
// 1. デバッグセッションを開始
{
  "tool": "debugger_launch",
  "arguments": {
    "sessionId": "my-debug",
    "adapter": "node",
    "program": "examples/dap-debugging/lcs-algorithm.js",
    "stopOnEntry": true,
    "enableLogging": true
  }
}

// 2. ブレークポイントを設定
{
  "tool": "debugger_set_breakpoints",
  "arguments": {
    "sessionId": "my-debug",
    "source": "examples/dap-debugging/lcs-algorithm.js",
    "lines": [24, 35]
  }
}

// 3. 実行を継続
{
  "tool": "debugger_continue",
  "arguments": {
    "sessionId": "my-debug"
  }
}

// 4. 変数を確認
{
  "tool": "debugger_get_variables",
  "arguments": {
    "sessionId": "my-debug",
    "scopeName": "Local"
  }
}

// 5. セッションを終了
{
  "tool": "debugger_disconnect",
  "arguments": {
    "sessionId": "my-debug"
  }
}
```

### 高度な機能

#### 条件付きブレークポイント
```javascript
{
  "tool": "debugger_set_breakpoints",
  "arguments": {
    "sessionId": "my-debug",
    "source": "performance-debugging.js",
    "lines": [42],
    "conditions": ["timeMs > 100"]  // 100ms以上かかった場合のみ停止
  }
}
```

#### 値の追跡
```javascript
{
  "tool": "debugger_track_value",
  "arguments": {
    "sessionId": "my-debug",
    "name": "dp[i][j]",
    "label": "DPテーブル更新"
  }
}
```

#### デバッグログの分析
```javascript
// ログを取得
{
  "tool": "debugger_get_log",
  "arguments": {
    "sessionId": "my-debug",
    "eventType": "breakpoint_hit",
    "limit": 50
  }
}

// ログをエクスポート
{
  "tool": "debugger_export_log",
  "arguments": {
    "sessionId": "my-debug",
    "format": "json"
  }
}
```

## デバッグのベストプラクティス

1. **ログ記録を有効化**: `enableLogging: true` でセッションの完全な記録を保存
2. **条件付きブレークポイント**: 特定の条件でのみ停止して効率的にデバッグ
3. **値の追跡**: 重要な変数の変化を記録して後で分析
4. **ブレークポイント統計**: どのブレークポイントが頻繁にヒットするかを確認
5. **ログのエクスポート**: デバッグセッションを保存して共有や詳細分析に使用

## トラブルシューティング

- **セッションが見つからない**: まず `debugger_launch` でセッションを作成
- **操作ができない**: セッションの状態を確認（stopped/running）
- **ログが記録されない**: `enableLogging: true` を指定
- **ブレークポイントがヒットしない**: ファイルパスと行番号を確認