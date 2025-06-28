/**
 * DAP MCPを使用したデバッグセッションの例
 * 
 * このスクリプトは、DAP MCPツールを使用して
 * プログラムをデバッグする方法を示します。
 */

// デバッグ対象のサンプルプログラム
function fibonacci(n) {
  if (n <= 1) return n;
  
  // 再帰呼び出し（パフォーマンスのボトルネック）
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function processArray(arr) {
  console.log(`配列処理開始: ${arr.length}要素`);
  let sum = 0;
  
  for (let i = 0; i < arr.length; i++) {
    const value = arr[i];
    sum += value;
    
    // 特定の条件でログ出力
    if (value % 5 === 0) {
      console.log(`5の倍数を発見: ${value}`);
    }
  }
  
  return sum;
}

function main() {
  console.log('=== デバッグセッションの例 ===');
  
  // フィボナッチ数列の計算
  console.log('\n1. フィボナッチ数列:');
  for (let i = 1; i <= 10; i++) {
    const start = Date.now();
    const result = fibonacci(i);
    const elapsed = Date.now() - start;
    console.log(`  fibonacci(${i}) = ${result} (${elapsed}ms)`);
  }
  
  // 配列処理
  console.log('\n2. 配列処理:');
  const testArrays = [
    [1, 2, 3, 4, 5],
    [10, 20, 30, 40, 50],
    [5, 10, 15, 20, 25]
  ];
  
  for (const arr of testArrays) {
    const sum = processArray(arr);
    console.log(`  合計: ${sum}`);
  }
  
  console.log('\n=== 完了 ===');
}

// デバッグ用のエントリーポイント
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { fibonacci, processArray };

/*
 * DAP MCPでのデバッグ方法:
 * 
 * 1. セッションを開始:
 *    debug_launch {
 *      sessionId: "example-session",
 *      adapter: "node",
 *      program: "examples/dap-debugging/debug-session-example.js",
 *      stopOnEntry: true,
 *      enableLogging: true
 *    }
 * 
 * 2. ブレークポイントを設定:
 *    debug_set_breakpoints {
 *      sessionId: "example-session",
 *      source: "examples/dap-debugging/debug-session-example.js",
 *      lines: [10, 21, 27],
 *      conditions: [null, "value > 10", null]
 *    }
 * 
 * 3. 実行を継続:
 *    debug_continue {
 *      sessionId: "example-session"
 *    }
 * 
 * 4. 変数を確認:
 *    debug_get_variables {
 *      sessionId: "example-session",
 *      scopeName: "Local"
 *    }
 * 
 * 5. 値を追跡:
 *    debug_track_value {
 *      sessionId: "example-session",
 *      name: "i",
 *      label: "ループカウンタ"
 *    }
 * 
 * 6. ステップ実行:
 *    debug_step_over {
 *      sessionId: "example-session"
 *    }
 * 
 * 7. ブレークポイント統計:
 *    debug_get_breakpoint_stats {
 *      sessionId: "example-session"
 *    }
 * 
 * 8. デバッグログを確認:
 *    debug_get_log {
 *      sessionId: "example-session",
 *      eventType: "breakpoint_hit"
 *    }
 * 
 * 9. セッションを終了:
 *    debug_disconnect {
 *      sessionId: "example-session"
 *    }
 */