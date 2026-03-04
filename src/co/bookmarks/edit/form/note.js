import s from './note.module.styl'
import t from '~t'
import React, { useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { set } from '~data/actions/config'
import { target } from '~target'
import links from '~config/links'

import { Text, Label, Checkbox } from '~co/common/form'
import Icon from '~co/common/icon'
import Button from '~co/common/button'
import { Confirm } from '~co/overlay/dialog'

export default function BookmarkEditFormNote({ autoFocus, item: { note, excerpt }, onCommit, onChange }) {
    const dispatch = useDispatch()
    const add_parse_description_local = useSelector(state => state.config.add_parse_description_local)

    const onChangeField = useCallback(e =>
        onChange({ [e.target.getAttribute('name')]: e.target.value }),
        []
    )

    const onToggleLocalParse = useCallback(e => {
        const val = e.target.checked
        dispatch(set('add_parse_description_local', val))

        // If turned off, immediately clear the excerpt so the server can parse it
        if (!val && excerpt) {
            onChange({ excerpt: '' })
        }
    }, [excerpt, onChange])

    const onMarkdownClick = useCallback(e => {
        e.preventDefault()
        Confirm(t.s('note'), {
            description: 'Styling with Markdown is supported',
            cancel: t.s('howToUse')
        }).then(ok => {
            if (!ok)
                window.open(links.help['add-note'])
        })
    }, [])

    return (
        <>
            <Label>
                {t.s('note')}
            </Label>

            <Text
                className={s.note}
                type='text'
                autoFocus={autoFocus == 'note'}
                name='note'
                value={note}
                autoSize={true}
                multiline={true}
                minRows={3}
                onChange={onChangeField}
                onBlur={onCommit}>
                <Button
                    className={s.button}
                    onClick={onMarkdownClick}
                    tabIndex='-1'
                    size='small'
                    title='Styling with Markdown is supported'>
                    <Icon name='markdown' />
                </Button>
            </Text>

            {target === 'extension' ? (
                <>
                    <div />
                    <Checkbox
                        checked={add_parse_description_local}
                        onChange={onToggleLocalParse}>
                        Extract description from page
                    </Checkbox>
                </>
            ) : null}
        </>
    )
}