/**
 * 축적기 과세 (design/03-tax-and-accounts.md §3)
 *
 * 핵심: ISA·연금계좌의 진짜 가치는 "세금이 없다"가 아니라
 * 축적기 배당 원천징수가 없어서 재투자 복리가 온전히 작동한다는 점이다.
 */

import type { TaxRuleSet } from '@/data/tax/types'
import type { AccountType } from '../types'

/** 축적기에 배당 원천징수가 발생하는 계좌인가 */
export function isTaxDeferred(account: AccountType): boolean {
  return account !== 'taxable'
}

/**
 * 분배금 원천징수. 일반계좌만 즉시 과세되고, ISA·연금계좌는 과세이연된다.
 */
export function taxOnDividend(dividend: number, account: AccountType, rules: TaxRuleSet): number {
  if (dividend <= 0) return 0
  if (isTaxDeferred(account)) return 0
  return dividend * rules.dividendWithholding.value.rate
}
