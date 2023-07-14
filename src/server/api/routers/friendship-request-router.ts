import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { FriendshipStatusSchema } from '@/utils/server/friendship-schemas'
import { authGuard } from '@/server/trpc/middlewares/auth-guard'
import { procedure } from '@/server/trpc/procedures'
import { IdSchema } from '@/utils/server/base-schemas'
import { router } from '@/server/trpc/router'

const SendFriendshipRequestInputSchema = z.object({
  friendUserId: IdSchema,
})

const canSendFriendshipRequest = authGuard.unstable_pipe(
  async ({ ctx, rawInput, next }) => {
    const { friendUserId } = SendFriendshipRequestInputSchema.parse(rawInput)

    await ctx.db
      .selectFrom('users')
      .where('users.id', '=', friendUserId)
      .select('id')
      .limit(1)
      .executeTakeFirstOrThrow(
        () =>
          new TRPCError({
            code: 'BAD_REQUEST',
          })
      )

    return next({ ctx })
  }
)

const AnswerFriendshipRequestInputSchema = z.object({
  friendUserId: IdSchema,
})

const canAnswerFriendshipRequest = authGuard.unstable_pipe(
  async ({ ctx, rawInput, next }) => {
    const { friendUserId } = AnswerFriendshipRequestInputSchema.parse(rawInput)

    await ctx.db
      .selectFrom('friendships')
      .where('friendships.userId', '=', friendUserId)
      .where('friendships.friendUserId', '=', ctx.session.userId)
      .where(
        'friendships.status',
        '=',
        FriendshipStatusSchema.Values['requested']
      )
      .select('friendships.id')
      .limit(1)
      .executeTakeFirstOrThrow(() => {
        throw new TRPCError({
          code: 'BAD_REQUEST',
        })
      })

    return next({ ctx })
  }
)

export const friendshipRequestRouter = router({
  send: procedure
    .use(canSendFriendshipRequest)
    .input(SendFriendshipRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      /**
       * Question 3: Fix bug
       */

      await ctx.db
        .deleteFrom('friendships')
        .where('userId', '=', ctx.session.userId)
        .where('friendUserId', '=', input.friendUserId)
        .execute()

      return await ctx.db
        .insertInto('friendships')
        .values({
          userId: ctx.session.userId,
          friendUserId: input.friendUserId,
          status: FriendshipStatusSchema.Values['requested'],
        })
        .execute()
    }),

  accept: procedure
    .use(canAnswerFriendshipRequest)
    .input(AnswerFriendshipRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction().execute(async (t) => {
        /**
         * Question 1: Implement api to accept a friendship request
         */

        // add a record to the database when user accept friend request
        await t.updateTable('friendships')
        .set({ status: 'accepted' })
        .where('userId', '=', input.friendUserId)
        .where('friendUserId', '=', ctx.session.userId)
        .execute();
        
        // find existing friend request by friend
        const existingFriendship = await t.selectFrom('friendships')
          .select(['userId', 'friendUserId', 'status'])
          .where('userId', '=', ctx.session.userId)
          .where('friendUserId', '=', input.friendUserId)
          .executeTakeFirst();

        if (existingFriendship) {
          await t.updateTable('friendships')
            .set({ status: 'accepted' })
            .where('userId', '=', ctx.session.userId)
            .where('friendUserId', '=', input.friendUserId)
            .execute();
        } else {
          await t.insertInto('friendships')
            .values({
              friendUserId: input.friendUserId,
              userId: ctx.session.userId,
              status: 'accepted'
            })
            .execute();
        }
      })
    }),

  decline: procedure
    .use(canAnswerFriendshipRequest)
    .input(AnswerFriendshipRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      /**
       * Question 2: Implement api to decline a friendship request
       */

      await ctx.db.updateTable('friendships')
        .set({ status: 'declined' })
        .where('userId', '=', input.friendUserId)
        .where('friendUserId', '=', ctx.session.userId)
        .execute();
    }),
})
