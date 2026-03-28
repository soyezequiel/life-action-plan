// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ClassifyReviewStep } from '../components/flow-interactive/ClassifyReviewStep'
import { GOAL_TYPE_OPTIONS, goalTypeDescription } from '../components/flow-interactive/labels'

describe('ClassifyReviewStep', () => {
  it('muestra una aclaracion breve para cada tipo de objetivo', () => {
    render(
      <ClassifyReviewStep
        confidence={0.81}
        goalType="RECURRENT_HABIT"
        risk="LOW"
        signals={[]}
        draft={{ goalType: 'RECURRENT_HABIT', context: '' }}
        onGoalTypeChange={vi.fn()}
        onContextChange={vi.fn()}
        onSubmit={vi.fn()}
        busy={false}
      />,
    )

    GOAL_TYPE_OPTIONS.forEach((goalType) => {
      expect(screen.getByText(goalTypeDescription(goalType))).toBeTruthy()
    })
  })
})
