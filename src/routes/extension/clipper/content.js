import React from 'react'
import { connect } from 'react-redux'
import Bookmark from '~co/bookmarks/edit'
import Buttons from './buttons'

function ClipperContent({ item, add_auto_save, add_default_collection, last_collection, add_parse_description_local }) {
    const collectionId = add_default_collection || last_collection

    return (
        <Bookmark
            _id={item.link}

            new={{
                item: {
                    ...item,
                    excerpt: add_parse_description_local ? item.excerpt : '',
                    collectionId
                },
                //preventDuplicate: false,
                autoCreate: add_auto_save
            }}

            autoFocus='note'
            autoWindowClose

            buttons={
                <Buttons
                    link={item.link}
                    collectionId={collectionId} />
            } />
    )
}

export default connect(
    ({ config: { add_auto_save, add_default_collection, last_collection, add_parse_description_local } }) => ({
        add_auto_save,
        add_default_collection,
        last_collection,
        add_parse_description_local
    })
)(ClipperContent)