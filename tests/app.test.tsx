// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../src/App'

beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); window.scrollTo = () => {} })
afterEach(cleanup)
describe('workspace interactions', () => {
  it('saves a vehicle and filters the shortlist', () => {
    const {container}=render(<App/>);
    expect(container.querySelectorAll('.vehicle-card').length).toBe(3)
    fireEvent.click(screen.getAllByLabelText('Save vehicle')[0])
    fireEvent.click(screen.getByRole('button',{name:'Saved vehicles'}))
    expect(container.querySelectorAll('.vehicle-card').length).toBe(1)
    expect(JSON.parse(localStorage.getItem('sureauto-saved')!)).toEqual(['lexus'])
  })
  it('validates VIN input and creates an unlisted record with missing checks', () => {
    const {container}=render(<App/>);
    fireEvent.click(screen.getByRole('button',{name:'Check a VIN'}))
    const input=screen.getByPlaceholderText('Enter 17-character VIN')
    fireEvent.change(input,{target:{value:'INVALID'}})
    fireEvent.click(screen.getByRole('button',{name:'Look up vehicle'}))
    expect(container.querySelector('.form-error')).not.toBeNull()
    fireEvent.change(input,{target:{value:'1HGCM82633A123456'}})
    fireEvent.click(screen.getByRole('button',{name:'Look up vehicle'}))
    expect(screen.getByRole('heading',{name:'Vehicle history record'})).toBeTruthy()
    expect(container.querySelector('.quote-box')?.textContent).toContain('₦15,000')
    expect(container.querySelectorAll('.stale-status').length).toBe(6)
  })
  it('opens a VIN deep link with exact freshness pricing', () => {
    history.replaceState(null,'','/v/WDDWF4JB0HR123456')
    const {container}=render(<App/>);
    expect(container.querySelector('.quote-box')?.textContent).toContain('₦2,500')
    expect(container.textContent).toContain('18d overdue')
  })
  it('finds a mileage discrepancy without asserting proven fraud', () => {
    history.replaceState(null,'','/dealer/intake')
    const {container}=render(<App/>);
    fireEvent.change(screen.getByLabelText('VIN'),{target:{value:'2T2BZMCA0JC123456'}})
    fireEvent.change(screen.getByLabelText('Incoming odometer reading (km)'),{target:{value:'20000'}})
    fireEvent.click(screen.getByRole('button',{name:'Screen vehicle'}))
    expect(container.querySelector('.screen-result')?.textContent).toContain('45,000 km')
    expect(container.querySelector('.screen-result')?.textContent).toContain('recording errors')
  })
  it('filters by make and location', () => {
    const {container}=render(<App/>);
    fireEvent.change(screen.getByLabelText('Make'),{target:{value:'Mercedes-Benz'}})
    expect(container.querySelectorAll('.vehicle-card').length).toBe(1)
    fireEvent.change(screen.getByLabelText('Location'),{target:{value:'Lagos'}})
    expect(container.querySelectorAll('.vehicle-card').length).toBe(0)
  })
})
