import type { Database } from '@/server/db'

import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { FriendshipStatusSchema } from '@/utils/server/friendship-schemas'
import { protectedProcedure } from '@/server/trpc/procedures'
import { router } from '@/server/trpc/router'
import {
  NonEmptyStringSchema,
  CountSchema,
  IdSchema,
} from '@/utils/server/base-schemas'

export const myFriendRouter = router({
  getById: protectedProcedure
    .input(
      z.object({
        friendUserId: IdSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.connection().execute(async (conn) => {
        /**
         * Question 4: Implement mutual friend count
         */
        const mutualFriendCountSubquery = userMutualFriendCount(conn, ctx.session.userId, input.friendUserId);

        return conn
          .selectFrom('users as friends')
          .innerJoin('friendships', 'friendships.friendUserId', 'friends.id')
          .innerJoin(
            userTotalFriendCount(conn).as('userTotalFriendCount'),
            'userTotalFriendCount.userId',
            'friends.id'
          )
          .leftJoin(
            mutualFriendCountSubquery.as('userMutualFriendCount'),
            'userMutualFriendCount.userId',
            'friends.id'
          )
          .where('friendships.userId', '=', ctx.session.userId)
          .where('friendships.friendUserId', '=', input.friendUserId)
          .where(
            'friendships.status',
            '=',
            FriendshipStatusSchema.Values['accepted']
          )
          .select([
            'friends.id',
            'friends.fullName',
            'friends.phoneNumber',
            'totalFriendCount',
            'mutualFriendCount'
          ])
          .executeTakeFirstOrThrow(() => new TRPCError({ code: 'NOT_FOUND' }))
          .then(
            z.object({
              id: IdSchema,
              fullName: NonEmptyStringSchema,
              phoneNumber: NonEmptyStringSchema,
              totalFriendCount: CountSchema,
              mutualFriendCount: CountSchema,
            }).parse
          )
      })
    }),
})

const userTotalFriendCount = (db: Database) => {
  return db
    .selectFrom('friendships')
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])
    .select((eb) => [
      'friendships.userId',
      eb.fn.count('friendships.friendUserId').as('totalFriendCount'),
    ])
    .groupBy('friendships.userId')
}

const userMutualFriendCount = (db: Database, userId: number, friendUserId: number) => {
  return db
    .selectFrom('friendships')
    .innerJoin('friendships as friendships2', 'friendships.friendUserId', 'friendships2.friendUserId')
    .where('friendships.userId', '=', userId)
    .where('friendships2.userId', '=', friendUserId)
    .where('friendships.status', '=', 'accepted')
    .where('friendships2.status', '=', 'accepted')
    .select((eb) => [
      'friendships2.userId',
      eb.fn.count('friendships2.friendUserId').as('mutualFriendCount'),
    ])
    .groupBy('friendships2.userId')
}